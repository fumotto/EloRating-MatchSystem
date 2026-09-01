# 10_TestSpecification_Part4_Matchmaking.md

# Test Specification — Part 4: マッチング

Version: 2.0
Status: Active
Last Updated: 2026-08-03

方針は `10_TestSpecification.md`（Part1）を参照する。

---

# 1. 対象

* `queue-match`
* `cancel-match-queue`
* `matchmaker`
* `cleanup-matching-queue`
* `matching_queue`
* 同時実行制御

---

# 2. 前提

* マッチ成立時、試合は `PLAYING` で作成される（ADR-008）。`MATCHED`・`IN_PROGRESS` は存在しない。
* `teams` に状態列は存在しない。試合中かどうかは `matches` から導出する。
* 優先順位は「レート差 → 待機時間 → Team ID」である。
* 許容レート差は `system_settings.match_rating_range` から取得する。
* 相手が見つからないことはエラーではない。`matched: false` を返す正常応答である。

---

# 3. テストケース

## 3.1 キュー登録

| ID           | 観点          | 前提条件            | 操作          | 期待結果                                | 種別          | テスト名                                                |
| ------------ | ----------- | --------------- | ----------- | ----------------------------------- | ----------- | --------------------------------------------------- |
| TC-QUEUE-001 | 正常登録        | LEADER・進行中の試合なし | queue-match | `matching_queue` に登録される             | Integration | `enqueues the team`                                 |
| TC-QUEUE-002 | 相手なしでの待機継続  | 他に待機チームなし       | queue-match | `matched: false` を返し、待機が継続する        | Integration | `keeps the team queued when no opponent is found`   |
| TC-QUEUE-003 | エラーにしない     | 他に待機チームなし       | queue-match | `result` が `OK` である（エラーコードを返さない）    | Integration | `returns OK when no opponent is available`          |
| TC-QUEUE-004 | 二重登録の拒否     | 既に待機中           | queue-match | `QUEUE-001` を返す                     | Integration | `rejects a duplicate queue entry`                   |
| TC-QUEUE-005 | 非LEADERの拒否  | MEMBERが実行       | queue-match | `TEAM-005` を返す                      | Integration | `rejects queueing by a non-leader`                  |
| TC-QUEUE-006 | BANチームの拒否   | BAN済み           | queue-match | `TEAM-006` を返す                      | Integration | `rejects queueing for a banned team`                |
| TC-QUEUE-007 | 試合中の拒否      | 進行中の試合が存在       | queue-match | `QUEUE-002` を返す                     | Integration | `rejects queueing while a match is in progress`     |
| TC-QUEUE-008 | DRAWN後の登録   | 直前の試合が `DRAWN`  | queue-match | 登録に成功する                             | Integration | `allows queueing after the previous match was drawn` |
| TC-QUEUE-009 | 存在しないチーム    | 無効なteamId       | queue-match | `TEAM-001` を返す                      | Integration | `rejects queueing for an unknown team`              |

## 3.1.1 待機できない条件（ADR-032 / ADR-034 / ADR-035）

| ID              | 観点                    | 前提条件                                | 操作          | 期待結果            | 種別          | テスト名                                                    |
| --------------- | --------------------- | ----------------------------------- | ----------- | --------------- | ----------- | ------------------------------------------------------- |
| TC-QUEUE-101    | クールダウン中               | `queue_cooldown_until` が未来          | queue-match | `QUEUE-006` を返す | Integration | `rejects queueing while on cooldown`                    |
| TC-QUEUE-102    | クールダウン明け              | `queue_cooldown_until` が過去          | queue-match | 成功する            | Integration | `allows queueing after the cooldown expires`            |
| TC-QUEUE-103    | NULL は制限なし            | `queue_cooldown_until` が NULL       | queue-match | 成功する            | Integration | `treats a null cooldown as no restriction`              |
| TC-QUEUE-104    | 保守停止中                 | `maintenance_paused = TRUE`         | queue-match | `QUEUE-007` を返す | Integration | `rejects queueing during maintenance`                   |
| TC-QUEUE-105    | **保守とシーズンの独立**        | `maintenance_paused = TRUE` の状態でシーズン再開 | admin-resume-season → queue-match | `QUEUE-007` のまま | Integration | `keeps the maintenance pause after resuming a season`   |
| TC-QUEUE-106    | **team_b 側での進行中判定**   | 当該チームが `team_b_id` の進行中試合を持つ        | queue-match | `QUEUE-002` を返す | Integration | `rejects queueing when the team is team_b in a match`   |
| TC-QUEUE-107    | 判定順                   | 停止中かつ人数不足                           | queue-match | 停止のコードが返る       | Integration | `reports the pause before the member shortage`          |

TC-QUEUE-105 は最重要である。`matchmaking_paused` を保守停止に流用した実装では、`admin-resume-season` が
無条件に `FALSE` へ戻すため、**シーズン再開が保守停止を解除してしまう**（ADR-034 ⑤）。

TC-QUEUE-106 は ADR-035 の要点である。**DBに制約は無く、アプリ層の判定だけが保証である。**
旧 `ux_matches_active_team_a` / `_b` はこの状態を防げなかった。

## 3.1.2 ペアの再マッチ抑止（ADR-034 ③）

| ID           | 観点          | 前提条件                     | 操作         | 期待結果               | 種別          | テスト名                                                  |
| ------------ | ----------- | ------------------------ | ---------- | ------------------ | ----------- | ----------------------------------------------------- |
| TC-QUEUE-110 | 抑止中のペア      | 有効な `match_avoidance` あり | matchmaker | 当該ペアは成立しない         | Integration | `does not pair teams under an avoidance entry`        |
| TC-QUEUE-111 | 方向によらない     | `(B,A)` の順で待機            | matchmaker | 同様に成立しない           | Integration | `applies avoidance regardless of pair order`          |
| TC-QUEUE-112 | 他の相手とは成立    | 抑止対象でない第三のチームが待機         | matchmaker | そちらと成立する           | Integration | `still pairs with a team outside the avoidance`       |
| TC-QUEUE-113 | 失効後         | `expires_at` を経過          | matchmaker | 再び成立する             | Integration | `pairs the teams again after expiry`                  |
| TC-QUEUE-114 | 相手不在はエラーでない | 抑止により候補が尽きる              | queue-match | `matched: false` で正常応答 | Integration | `returns matched:false when avoidance exhausts候補`     |

## 3.2 キュー解除

| ID           | 観点         | 前提条件      | 操作                 | 期待結果                      | 種別          | テスト名                                                |
| ------------ | ---------- | --------- | ------------------ | ------------------------- | ----------- | --------------------------------------------------- |
| TC-QUEUE-010 | 正常解除       | 待機中       | cancel-match-queue | `matching_queue` から削除される  | Integration | `cancels the queue entry`                           |
| TC-QUEUE-011 | 未登録の拒否     | 待機していない   | cancel-match-queue | `QUEUE-004` を返す           | Integration | `rejects cancelling when not queued`                |
| TC-QUEUE-012 | 非LEADERの拒否 | MEMBERが実行 | cancel-match-queue | `TEAM-005` を返す            | Integration | `rejects cancelling by a non-leader`                |
| TC-QUEUE-013 | 成立後の解除     | マッチ成立直後   | cancel-match-queue | `QUEUE-004` を返す（既にキューにない） | Integration | `rejects cancelling after the match was created`    |

## 3.3 マッチングアルゴリズム

| ID           | 観点              | 前提条件                            | 操作          | 期待結果                    | 種別          | テスト名                                                   |
| ------------ | --------------- | ------------------------------- | ----------- | ----------------------- | ----------- | ------------------------------------------------------ |
| TC-QUEUE-014 | レート差が範囲内        | 差400以内の2チームが待機                  | matchmaker  | マッチが成立する                | Integration | `matches two teams within the rating range`            |
| TC-QUEUE-015 | レート差が範囲外        | 差401の2チームが待機                    | matchmaker  | マッチが成立せず、双方が待機を継続する     | Integration | `does not match teams beyond the rating range`         |
| TC-QUEUE-016 | 境界値（ちょうど）       | 差400ちょうど（TEAM_A 1500 / TEAM_E 1900） | matchmaker  | マッチが成立する（境界値を含む）        | Integration | `matches teams exactly at the rating range boundary`   |
| TC-QUEUE-017 | 境界値（1超過）        | 差401                            | matchmaker  | 成立しない                   | Integration | `rejects a match one point beyond the boundary`        |
| TC-QUEUE-018 | 第1優先：最小レート差     | 候補が複数、レート差が異なる                  | matchmaker  | レート差が最小の相手が選ばれる         | Integration | `prefers the opponent with the smallest rating gap`    |
| TC-QUEUE-019 | 待機時間より優先        | レート差が小さいが待機が新しい相手と、レート差が大きく古い相手 | matchmaker  | **レート差が小さい方**が選ばれる      | Integration | `prioritises rating gap over waiting time`             |
| TC-QUEUE-020 | 第2優先：待機時間       | レート差が同一の候補が複数                   | matchmaker  | 待機開始が最も早い相手が選ばれる        | Integration | `prefers the longest waiting opponent on equal gaps`   |
| TC-QUEUE-021 | 第3優先：Team ID    | レート差・待機時間が同一                    | matchmaker  | Team ID 昇順で決定される        | Integration | `breaks ties by team id`                               |
| TC-QUEUE-022 | 設定値の反映          | `match_rating_range` を200へ変更    | matchmaker  | 差300の組み合わせが成立しなくなる      | Integration | `reads the rating range from system settings`          |
| TC-QUEUE-023 | BANチームの除外       | 待機中にBANされたチームが存在                | matchmaker  | 対象から除外される               | Integration | `excludes banned teams from matchmaking`               |
| TC-QUEUE-024 | 試合中チームの除外       | 進行中の試合があるチームがキューに残存             | matchmaker  | 対象から除外される               | Integration | `excludes teams that already have a match`             |
| TC-QUEUE-025 | 自己マッチの防止        | 待機チームが1件のみ                      | matchmaker  | 同一チーム同士のマッチが作られない       | Integration | `never matches a team against itself`                  |
| TC-QUEUE-026 | 奇数チーム           | 3チームが待機                         | matchmaker  | 1組が成立し、1チームが待機を継続する     | Integration | `leaves one team queued when the count is odd`         |
| TC-QUEUE-027 | 複数組の成立          | 4チームが待機                         | matchmaker  | 2組が成立し、キューが空になる         | Integration | `creates multiple matches in one run`                  |

## 3.4 マッチ成立時の状態

| ID           | 観点                  | 前提条件  | 操作         | 期待結果                                       | 種別          | テスト名                                                    |
| ------------ | ------------------- | ----- | ---------- | ------------------------------------------ | ----------- | ------------------------------------------------------- |
| TC-QUEUE-028 | 初期状態                | マッチ成立 | matches取得  | `status` が `PLAYING` である                   | Integration | `creates the match in the PLAYING state`                |
| TC-QUEUE-029 | `started_at`        | マッチ成立 | matches取得  | マッチ成立時刻が設定される                              | Integration | `sets started_at at match creation`                     |
| TC-QUEUE-030 | `report_deadline_at` | マッチ成立 | matches取得  | `started_at + report_timeout_minutes` である | Integration | `sets the report deadline from system settings`         |
| TC-QUEUE-031 | 期限の必須設定             | マッチ成立 | matches取得  | `report_deadline_at` がNULLでない              | Integration | `never creates a match without a report deadline`       |
| TC-QUEUE-032 | キューからの削除            | マッチ成立 | matching_queue取得 | 両チームが削除される                                 | Integration | `removes both teams from the queue`                     |
| TC-QUEUE-033 | Realtime通知          | マッチ成立 | 通知確認       | `MATCH_CREATED` が送信される                     | Integration | `publishes MATCH_CREATED`                               |
| TC-QUEUE-034 | 監査ログ                | マッチ成立 | audit_logs取得 | `MATCH_CREATED` が記録される                     | Integration | `records match creation in the audit log`               |
| TC-QUEUE-035 | チーム状態の非更新           | マッチ成立 | teams取得    | `teams` に状態列が存在せず、更新も発生しない                 | Integration | `does not write any team status column`                 |

## 3.5 同時実行制御

| ID           | 観点            | 前提条件            | 操作             | 期待結果                                | 種別          | テスト名                                                   |
| ------------ | ------------- | --------------- | -------------- | ----------------------------------- | ----------- | ------------------------------------------------------ |
| TC-QUEUE-036 | 同時登録          | 2チームが同時に登録      | queue-match ×2 | 1試合のみ生成される                          | Integration | `creates exactly one match for two simultaneous joins` |
| TC-QUEUE-037 | 二重マッチの防止      | 多数チームが同時に登録     | queue-match ×N | 同一チームが2つの試合に含まれない                   | Integration | `never assigns a team to two matches`                  |
| TC-QUEUE-038 | matchmakerの多重起動 | 同時に複数回起動        | matchmaker ×2  | 重複した試合が作られない                        | Integration | `serialises concurrent matchmaker runs`                |
| TC-QUEUE-039 | ロールバック        | `matches` 挿入で例外 | matchmaker     | キューの状態が維持される                        | Integration | `keeps the queue intact when match creation fails`     |
| TC-QUEUE-040 | DB制約による最終防御   | 同一チームで2件目の試合を挿入 | 直接INSERT       | 部分UNIQUEインデックス違反となる                 | Database    | `rejects a second active match for the same team`      |

## 3.6 救済実行とクリーンアップ

| ID           | 観点        | 前提条件                     | 操作                     | 期待結果                     | 種別          | テスト名                                                 |
| ------------ | --------- | ------------------------ | ---------------------- | ------------------------ | ----------- | ---------------------------------------------------- |
| TC-QUEUE-041 | 同期実行での成立  | 相手が既に待機中                 | queue-match            | 登録と同時にマッチが成立する           | Integration | `matches synchronously on queue entry`               |
| TC-QUEUE-042 | Cronでの救済  | 同期実行で取りこぼした組み合わせが存在      | matchmaker（Cron）       | 組み合わせが成立する               | Integration | `picks up leftover pairs on the scheduled run`       |
| TC-QUEUE-043 | 滞留の削除     | 24時間以上前の待機情報             | cleanup-matching-queue | 削除される                    | Integration | `removes stale queue entries older than 24 hours`    |
| TC-QUEUE-044 | 正常な待機の保持  | 直近の待機情報                  | cleanup-matching-queue | 削除されない                   | Integration | `keeps recent queue entries`                         |

## 3.7 RLS（Database）

| ID           | 観点        | 前提条件      | 操作                 | 期待結果          | 種別       | テスト名                                              |
| ------------ | --------- | --------- | ------------------ | ------------- | -------- | ------------------------------------------------- |
| TC-QUEUE-045 | 自チームの参照   | 自チームが待機中  | matching_queue SELECT | 取得できる         | Database | `lets a member read their own queue entry`        |
| TC-QUEUE-046 | 他チームの非参照  | 他チームが待機中  | matching_queue SELECT | 取得できない        | Database | `hides queue entries of other teams`              |
| TC-QUEUE-047 | 直接INSERT  | クライアント経由  | matching_queue INSERT | 拒否される         | Database | `rejects a direct insert from the client`         |
| TC-QUEUE-048 | 直接DELETE  | クライアント経由  | matching_queue DELETE | 拒否される         | Database | `rejects a direct delete from the client`         |

他チームの待機状況が見えると、有利な相手を狙った待ち伏せが可能になるため、TC-QUEUE-046 は重要である。

## 3.8 ペア再戦の抑止（ADR-036 ①）

| ID           | 観点          | 前提条件                              | 操作         | 期待結果                                  | 種別          | テスト名                                                             |
| ------------ | ----------- | --------------------------------- | ---------- | ------------------------------------- | ----------- | ---------------------------------------------------------------- |
| TC-QUEUE-060 | 抑止中のペア      | 同じ2チームが抑止期間内に確定した試合を持つ            | matchmaker | マッチが成立せず、待機列からも外れない                   | Integration | `does not pair teams that already completed a match inside the cooldown` |
| TC-QUEUE-061 | 期間外のペア      | 直近の確定が抑止期間より前                     | matchmaker | 通常どおりマッチが成立する                         | Integration | `still pairs teams whose previous match falls outside the cooldown`      |
| TC-QUEUE-062 | 対象は COMPLETED のみ | 抑止が有効                             | matchmaker | 問い合わせが `status = 'COMPLETED'` のみを見て、`DRAWN` を含まない | Integration | `looks only at completed matches inside the configured window`           |
| TC-QUEUE-063 | 無効化         | `rematch_cooldown_hours = 0`      | matchmaker | 問い合わせ自体を行わず、マッチが成立する                  | Integration | `skips the lookup entirely when the cooldown is disabled`                |

**TC-QUEUE-062 が最も重要である。** `DRAWN` まで抑止すると、対戦が成立しなかっただけの
チームが次の待機まで待たされる。ADR-034 の「落ち度の無い側に代償を負わせない」に反する。

**TC-QUEUE-063 は検証環境の前提そのものである**（ADR-036 ⑤）。0 で無効にならないと、
複数アカウントを用いた確認ができなくなる。

抑止によりマッチが成立しないことは**エラーではない**。待機の継続である。
エラーコードを期待するテストを書いてはならない（6章）。

---

# 4. 境界値

| 対象     | 境界値                        |
| ------ | -------------------------- |
| レート差   | 0 / 399 / 400 / 401        |
| 待機チーム数 | 0 / 1 / 2 / 3 / 4 / 多数     |
| 同時登録数  | 2 / 10 / 100               |
| 滞留時間   | 23時間59分 / 24時間 / 24時間1分    |

---

# 5. 異常系

* 存在しないチームでのキュー登録
* 重複登録
* BANチーム・試合中チームの登録
* キャンセル対象なし
* マッチ生成中のDBエラー
* 同時実行による競合

## 5.1 Realtime送信失敗

Realtime送信の失敗ではトランザクションをロールバックしない（`06_ErrorCode.md` 14章）。

送信に失敗しても試合が作成済みであることを検証する。

---

# 6. 作成してはならないテスト

| 対象                     | 理由                              |
| ---------------------- | ------------------------------- |
| `status = 'MATCHED'` の検証 | ADR-008により廃止                    |
| `IN_PROGRESS` の検証      | 存在しない状態値                        |
| `teams.status` の更新検証   | 列が存在しない                         |
| 「相手が見つからない」のエラー検証      | 正常応答であり、エラーコードを持たない             |

---

# 7. AI実装ルール

* マッチングはキュー登録時に同期実行し、Cronで救済することを検証する。
* 優先順位は「レート差 → 待機時間 → Team ID」を厳守して検証する。特にレート差が待機時間より優先されることを明示的に検証する（TC-QUEUE-019）。
* 許容レート差が設定値から取得されることを検証する。
* マッチ成立処理が単一トランザクションであることを検証する。
* 同時実行時に二重マッチが発生しないことを検証する。
* `report_deadline_at` が必ず設定されることを検証する。設定されないと自動解決が機能しない。
* Realtime通知はマッチ成立後に送信されることを検証する。
* ペア再戦の抑止が `COMPLETED` のみを対象とし、`DRAWN` を含めないことを検証する（ADR-036 ①）。
* 抑止は設定値 `rematch_cooldown_hours` から取得し、`0` で問い合わせ自体を行わないことを検証する。
  **抑止をコードへハードコードしない。**
