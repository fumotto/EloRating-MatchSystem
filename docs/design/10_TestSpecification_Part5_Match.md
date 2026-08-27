# 10_TestSpecification_Part5_Match.md

# Test Specification — Part 5: 試合

Version: 2.0
Status: Active
Last Updated: 2026-08-03

方針は `10_TestSpecification.md`（Part1）を参照する。

---

# 1. 対象

* `matches`
* `concede-match`（基本の経路）
* `report-match`（反対申告を含む）
* `approve-match`
* `extend-match-deadline`
* `request-no-contest` / `respond-no-contest`
* `auto-resolve-matches`
* `admin-void-match` / `admin-void-matches`

**`reject-match` は対象外である。廃止した**（ADR-032 ②）。
* 状態遷移と不変条件
* 楽観ロック

---

# 2. 前提

状態遷移の正本は `03_Database.md` 7.1 である。

```text
PLAYING ──申告──→ WINNER_REPORTED ──承認──→ COMPLETED
   ↑                    │
   └───拒否（上限未満）─────┘
                        │
PLAYING ─申告期限切れ─→ DRAWN ←─拒否（上限到達）─┘
```

* 状態は `PLAYING` / `WINNER_REPORTED` / `COMPLETED` / `DRAWN` の4つである。
* 試合確定日時の列は `completed_at` である（ADR-002）。`finished_at` は存在しない。
* 申告は勝者チームの、承認・拒否は敗者チームの**いずれのメンバーでも**実行できる（ADR-009）。
* 更新系操作は `version` を送信する。

---

# 3. テストケース

## 3.1 試合の作成

| ID           | 観点             | 前提条件  | 操作        | 期待結果                    | 種別          | テスト名                                            |
| ------------ | -------------- | ----- | --------- | ----------------------- | ----------- | ----------------------------------------------- |
| TC-MATCH-001 | 作成             | マッチ成立 | matches取得 | 試合が作成される                | Integration | `creates a match on matchmaking`                |
| TC-MATCH-002 | 初期状態           | 作成直後  | matches取得 | `status` が `PLAYING`    | Integration | `starts the match in the PLAYING state`         |
| TC-MATCH-003 | 申告情報の未設定       | 作成直後  | matches取得 | `winner_team_id` 等がNULL | Integration | `leaves the report fields empty on creation`    |
| TC-MATCH-004 | `completed_at` | 作成直後  | matches取得 | NULLである                 | Integration | `keeps completed_at null before completion`     |
| TC-MATCH-005 | `version`      | 作成直後  | matches取得 | 1である                    | Integration | `initialises the optimistic lock version to 1`  |

## 3.2 勝利申告

| ID           | 観点            | 前提条件               | 操作           | 期待結果                              | 種別          | テスト名                                                     |
| ------------ | ------------- | ------------------ | ------------ | --------------------------------- | ----------- | -------------------------------------------------------- |
| TC-MATCH-006 | 正常申告          | `PLAYING`・勝者チームのLEADER | report-match | `WINNER_REPORTED` になる             | Integration | `reports the winner`                                     |
| TC-MATCH-007 | **メンバーによる申告** | `PLAYING`・勝者チームのMEMBER | report-match | 成功する（LEADER限定ではない）                | Integration | `lets any member of the winning team report`             |
| TC-MATCH-008 | 申告情報の記録       | 申告後                | matches取得    | `reported_by_profile_id`・`reported_at` が設定される | Integration | `stores who reported and when`                           |
| TC-MATCH-009 | 承認期限の設定       | 申告後                | matches取得    | `approve_deadline_at` が設定される      | Integration | `sets the approval deadline on report`                   |
| TC-MATCH-010 | 敗者による申告の拒否    | 敗者チームのメンバーが実行      | report-match | `MATCH-005` を返す                   | Integration | `rejects a report from the losing team`                  |
| TC-MATCH-011 | 第三者による申告の拒否   | 無関係チームのメンバー        | report-match | `MATCH-005` を返す                   | Integration | `rejects a report from an unrelated team`                |
| TC-MATCH-012 | 参加外チームの指定     | `winnerTeamId` が参加チームでない | report-match | `MATCH-006` を返す                   | Integration | `rejects a winner that is not part of the match`         |
| TC-MATCH-013 | 二重申告の拒否       | `WINNER_REPORTED`  | report-match | `MATCH-003` を返す                   | Integration | `rejects a second report`                                |
| TC-MATCH-014 | 確定済みへの申告      | `COMPLETED`        | report-match | `MATCH-002` を返す                   | Integration | `rejects a report on a completed match`                  |
| TC-MATCH-015 | 解散済みへの申告      | `DRAWN`            | report-match | `MATCH-002` を返す                   | Integration | `rejects a report on a drawn match`                      |
| TC-MATCH-016 | 存在しない試合       | 無効なmatchId         | report-match | `MATCH-001` を返す                   | Integration | `returns not found for an unknown match`                 |
| TC-MATCH-017 | 同一チーム内の同時申告   | 2名が同時に申告           | report-match ×2 | 1件のみ成功し、もう1件は `MATCH-003` または `MATCH-008` | Integration | `accepts only the first report within the same team`     |
| TC-MATCH-018 | レート未更新        | 申告後                | teams取得      | レートが変化しない                         | Integration | `does not update ratings on report`                      |
| TC-MATCH-019 | Realtime通知    | 申告後                | 通知確認         | `WINNER_REPORTED` が送信される          | Integration | `publishes WINNER_REPORTED`                              |

## 3.3 承認

| ID           | 観点             | 前提条件                    | 操作            | 期待結果                                | 種別          | テスト名                                                  |
| ------------ | -------------- | ----------------------- | ------------- | ----------------------------------- | ----------- | ----------------------------------------------------- |
| TC-MATCH-020 | 正常承認           | `WINNER_REPORTED`・敗者LEADER | approve-match | `COMPLETED` になる                     | Integration | `approves the match result`                           |
| TC-MATCH-021 | **メンバーによる承認**  | 敗者チームのMEMBER            | approve-match | 成功する                                | Integration | `lets any member of the losing team approve`          |
| TC-MATCH-022 | 確定情報の記録        | 承認後                     | matches取得     | `approved_by_profile_id`・`approved_at`・`completed_at` が設定される | Integration | `stores who approved and when`                        |
| TC-MATCH-023 | `auto_approved` | 手動承認後                   | matches取得     | `false` である                         | Integration | `marks a manual approval as not auto-approved`        |
| TC-MATCH-024 | レート更新          | 承認後                     | teams取得       | 両チームのレートが更新される                      | Integration | `updates both team ratings`                           |
| TC-MATCH-025 | 履歴の作成          | 承認後                     | rating_history取得 | 2件作成される                             | Integration | `creates two rating history rows`                     |
| TC-MATCH-026 | 勝者による承認の拒否     | 勝者チームのメンバー              | approve-match | `MATCH-005` を返す                     | Integration | `rejects an approval from the winning team`           |
| TC-MATCH-027 | 第三者による承認の拒否    | 無関係チームのメンバー             | approve-match | `MATCH-005` を返す                     | Integration | `rejects an approval from an unrelated team`          |
| TC-MATCH-028 | 未申告での承認        | `PLAYING`               | approve-match | `MATCH-004` を返す                     | Integration | `rejects an approval before the winner is reported`   |
| TC-MATCH-029 | 二重承認の拒否        | `COMPLETED`             | approve-match | `MATCH-002` を返し、レートが再更新されない         | Integration | `rejects a second approval without touching ratings`  |
| TC-MATCH-030 | 楽観ロックの競合       | 古い `version` を送信        | approve-match | `MATCH-008` を返す                     | Integration | `rejects a stale version`                             |
| TC-MATCH-031 | 同時承認           | 2名が同時に承認                | approve-match ×2 | 1件のみ成功し、レート更新は1回のみ                  | Integration | `applies the rating update exactly once`              |
| TC-MATCH-032 | Realtime通知     | 承認後                     | 通知確認          | `MATCH_COMPLETED` と `RANKING_UPDATED` が送信される | Integration | `publishes MATCH_COMPLETED and RANKING_UPDATED`       |
| TC-MATCH-033 | 監査ログ           | 承認後                     | audit_logs取得  | `MATCH_APPROVED` が記録される              | Integration | `records the approval in the audit log`               |

## 3.4 投了（ADR-032 ①）

**基本の経路である。** 3.2 の勝者申告より先に検証する。

| ID           | 観点               | 前提条件                       | 操作             | 期待結果                             | 種別          | テスト名                                                      |
| ------------ | ---------------- | -------------------------- | -------------- | -------------------------------- | ----------- | --------------------------------------------------------- |
| TC-MATCH-034 | 正常投了             | `PLAYING`・敗者チームのメンバー        | concede-match  | 即 `COMPLETED` になる                | Integration | `completes the match immediately on concession`           |
| TC-MATCH-035 | 承認を要さない          | 投了後                        | matches取得      | 相手の操作なしで確定している                   | Integration | `does not require approval from the opponent`             |
| TC-MATCH-036 | 勝者の決定            | 投了後                        | matches取得      | `winner_team_id` が相手チームである       | Integration | `sets the opponent as the winner`                         |
| TC-MATCH-037 | レート更新            | 投了後                        | teams取得        | 両チームのレートが更新される                   | Integration | `updates both ratings on concession`                      |
| TC-MATCH-038 | **クールダウン無し**     | 投了後                        | teams取得        | `queue_cooldown_until` が設定されない   | Integration | `does not apply a cooldown after conceding`               |
| TC-MATCH-039 | **即再キュー可**       | 投了後                        | queue-match    | 成功する                             | Integration | `lets the conceding team queue again immediately`         |
| TC-MATCH-040 | 申告済みからの投了        | `WINNER_REPORTED`（相手が申告）    | concede-match  | `COMPLETED` になる（承認と同じ結果）         | Integration | `treats a concession as an approval`                      |
| TC-MATCH-041 | **自分の申告への投了拒否** | `WINNER_REPORTED`（自チームが申告） | concede-match  | `MATCH-009` を返す                  | Integration | `rejects conceding a win the team itself reported`        |
| TC-MATCH-042 | 第三者による投了         | 無関係チームのメンバー                | concede-match  | `MATCH-005` を返す                  | Integration | `rejects a concession from an unrelated team`             |
| TC-MATCH-043 | 確定済みへの投了         | `COMPLETED`                | concede-match  | `MATCH-002` を返す                  | Integration | `rejects a concession on a completed match`               |
| TC-MATCH-044 | 監査ログ             | 投了後                        | audit_logs取得   | `MATCH_CONCEDED` が記録される          | Integration | `records the concession in the audit log`                 |

TC-MATCH-041 は撤回と投了の混同を防ぐ。**撤回の手段は用意しない。** 用意すると、申告を出しては引っ込めて
相手の承認期限を消費できる（`06_ErrorCode.md` 11章）。

## 3.4.1 反対申告（ADR-032 ⑩）

`reject-match`（拒否）は廃止した。反論の手段は反対申告である。

| ID              | 観点                   | 前提条件                    | 操作                          | 期待結果                                   | 種別          | テスト名                                                       |
| --------------- | -------------------- | ----------------------- | --------------------------- | -------------------------------------- | ----------- | ---------------------------------------------------------- |
| TC-MATCH-034-01 | 正常な反対申告              | `WINNER_REPORTED`・相手チーム | report-match                | `counter_claim_team_id` が設定される         | Integration | `records a counter claim from the opponent`                |
| TC-MATCH-034-02 | **承認期限を延長しない**       | 反対申告後                   | matches取得                   | `approve_deadline_at` が変わらない           | Integration | `does not extend the approval deadline on a counter claim` |
| TC-MATCH-034-03 | **自動承認が止まる**         | 反対申告後・承認期限を経過           | auto-resolve-matches        | `COMPLETED` にならない                      | Integration | `suppresses auto-approval while a counter claim stands`    |
| TC-MATCH-034-04 | **CONFLICT で解散**     | 反対申告のまま承認期限を経過          | auto-resolve-matches        | `DRAWN` / `no_contest_reason='CONFLICT'` | Integration | `draws the match as CONFLICT when neither side yields`     |
| TC-MATCH-034-05 | CONFLICT のレート        | 解散後                     | teams取得                     | レートが変化しない                              | Integration | `does not change ratings on a CONFLICT draw`               |
| TC-MATCH-034-06 | **CONFLICT のクールダウン** | 解散後                     | teams取得                     | **両チーム**に設定される                         | Integration | `applies a cooldown to both teams on CONFLICT`             |
| TC-MATCH-034-07 | **主張の記録が残る**         | CONFLICT 解散後            | matches取得                   | `reported_by_profile_id`・`counter_claim_team_id` が残る | Integration | `keeps both claims on record after a CONFLICT draw`        |
| TC-MATCH-034-08 | 投了による解消              | 反対申告中                   | concede-match               | `COMPLETED` になる                        | Integration | `resolves a counter claim by conceding`                    |
| TC-MATCH-034-09 | 自チームからの二重申告          | 申告済みチームが再度 report-match | report-match                | `MATCH-003` を返す                        | Integration | `rejects a duplicate report from the reporting team`       |
| TC-MATCH-034-10 | 二度目の反対申告             | `counter_claim_team_id` 設定済み | report-match           | `MATCH-003` を返す                        | Integration | `rejects a second counter claim`                           |
| TC-MATCH-034-11 | **押し間違えの復旧**         | 敗者が誤って自チームの勝利を申告        | report-match（相手）→ concede-match（誤申告側） | 正しい結果で `COMPLETED` になる       | Integration | `recovers from a mis-clicked winner report`                |

TC-MATCH-034-03 は最重要である。**条件に `counter_claim_team_id IS NULL` を含めない実装では、
矛盾する2つの主張があるにもかかわらず先に申告した側で確定し、早く嘘をついた側が勝つ。**

TC-MATCH-034-11 は ADR-033 が結果の訂正を捨てられる根拠そのものである。

## 3.4.2 報告期限の延長（ADR-032 ⑦）

| ID              | 観点            | 前提条件                | 操作                     | 期待結果                                | 種別          | テスト名                                                    |
| --------------- | ------------- | ------------------- | ---------------------- | ----------------------------------- | ----------- | ------------------------------------------------------- |
| TC-MATCH-034-20 | 正常延長          | `PLAYING`           | extend-match-deadline  | `report_deadline_at` が伸びる           | Integration | `extends the report deadline`                           |
| TC-MATCH-034-21 | **既存期限からの加算** | 期限まで残り10分           | extend-match-deadline  | 新期限＝旧期限＋`report_extension_minutes`  | Integration | `adds the extension to the existing deadline`           |
| TC-MATCH-034-22 | 相手チームからの延長    | `PLAYING`・相手チームのメンバー | extend-match-deadline  | 成功する                                | Integration | `lets either team extend the deadline`                  |
| TC-MATCH-034-23 | 上限到達          | `max_report_extensions` に到達 | extend-match-deadline | `MATCH-010` を返す                     | Integration | `rejects an extension beyond the limit`                 |
| TC-MATCH-034-24 | 申告済みでの延長      | `WINNER_REPORTED`   | extend-match-deadline  | `MATCH-003` を返す                     | Integration | `rejects an extension after the winner is reported`     |

TC-MATCH-034-21 は「現在時刻から」を防ぐ。現在時刻起点では期限際の駆け引きが生まれる。

## 3.4.3 不成立の申請（ADR-032 ⑧ ＋ ADR-034 ②）

| ID              | 観点                    | 前提条件                          | 操作                                      | 期待結果                                    | 種別          | テスト名                                                     |
| --------------- | --------------------- | ----------------------------- | --------------------------------------- | --------------------------------------- | ----------- | -------------------------------------------------------- |
| TC-MATCH-034-40 | **即時の申請**             | マッチ成立の直後                      | request-no-contest                       | 成功する（時間の制限が無い）                          | Integration | `accepts a no-contest request right after matchmaking`   |
| TC-MATCH-034-41 | 承諾による即時成立             | 申請直後                          | respond-no-contest（ACCEPT）              | `DRAWN` / `MUTUAL`。猶予を待たない              | Integration | `settles a mutual no-contest immediately`                |
| TC-MATCH-034-42 | **MUTUAL のクールダウン無し**  | 承諾後                           | teams取得                                 | 両チームとも設定されない                            | Integration | `applies no cooldown on a mutual no-contest`             |
| TC-MATCH-034-43 | **MUTUAL は確定率に不計上**   | 承諾後                           | team_ranking_view取得                     | `no_contests` が増えない                     | Integration | `excludes a mutual no-contest from the settle rate`      |
| TC-MATCH-034-44 | 対戦継続の宣言               | 申請中                           | respond-no-contest（CONTINUE）            | `PLAYING` のまま。申請がクリアされる                 | Integration | `clears the request when the opponent continues`         |
| TC-MATCH-034-45 | **期限を伸ばさない**          | 申請→継続→再申請→継続                  | matches取得                               | `report_deadline_at` が変わらない             | Integration | `does not extend the report deadline through requests`   |
| TC-MATCH-034-46 | 申告・投了・延長による打ち消し       | 申請中                           | report-match / concede-match / extend    | 申請がクリアされる                               | Integration | `treats a report, concession or extension as a response` |
| TC-MATCH-034-47 | **満期前は成立しない**         | 申請から猶予経過・マッチ成立から `no_show_minutes` 未経過 | auto-resolve-matches         | `DRAWN` にならない                          | Integration | `does not settle a no-show before both timers mature`    |
| TC-MATCH-034-48 | **満期後に NO_SHOW 成立**   | 両方の条件を満たす                     | auto-resolve-matches                     | `DRAWN` / `NO_SHOW`                     | Integration | `settles a no-show once both timers mature`              |
| TC-MATCH-034-49 | **NO_SHOW のクールダウン**   | 成立後                           | teams取得                                 | **無応答側のみ**に設定される                       | Integration | `applies the cooldown only to the unresponsive team`     |
| TC-MATCH-034-50 | **NO_SHOW の不戦計上**     | 成立後                           | team_ranking_view取得                     | **無応答側のみ** `no_contests` が増える          | Integration | `counts the no-show against the unresponsive team only`  |
| TC-MATCH-034-51 | 申請回数の上限               | `max_no_contest_requests` に到達 | request-no-contest                       | `MATCH-012` を返す                        | Integration | `rejects a request beyond the limit`                     |
| TC-MATCH-034-52 | 保留中の再申請               | 申請中                           | request-no-contest                       | `MATCH-011` を返す                        | Integration | `rejects a request while one is pending`                 |
| TC-MATCH-034-53 | **申告済みでの申請拒否**        | `WINNER_REPORTED`             | request-no-contest                       | `MATCH-003` を返す                        | Integration | `rejects a no-contest request after a winner is reported` |
| TC-MATCH-034-54 | 申請者自身による応答            | 申請したチームが応答                    | respond-no-contest                       | `MATCH-005` を返す                        | Integration | `rejects a response from the requesting team`            |
| TC-MATCH-034-55 | **CONNECTION で抑止登録**  | 理由 `CONNECTION` で承諾           | match_avoidance取得                       | 1件登録される。`team_low_id < team_high_id`   | Integration | `registers avoidance for a connection no-contest`        |
| TC-MATCH-034-56 | **NO_SHOW では登録しない**   | 無応答で成立                        | match_avoidance取得                       | 登録されない                                 | Integration | `does not register avoidance on a no-show`               |
| TC-MATCH-034-57 | 抑止によるマッチ除外            | 抑止登録済みのペアが待機                  | matchmaker                               | 当該ペアは成立しない                             | Integration | `does not pair teams with an active avoidance entry`     |
| TC-MATCH-034-58 | 抑止の失効                 | `expires_at` を経過              | matchmaker                               | 再びマッチする                                | Integration | `pairs the teams again after the avoidance expires`      |
| TC-MATCH-034-59 | 1日の上限超過               | `mutual_no_contest_daily_limit` を超える承諾 | respond-no-contest（ACCEPT）  | クールダウンが課される                            | Integration | `applies a cooldown beyond the daily mutual limit`       |

TC-MATCH-034-47 と -48 の対は **AND 条件**を検証する。片方だけの実装では、劣勢の側が対戦直後に申請して
相手の短い離席に賭けられる。

TC-MATCH-034-56 は歯止めである。片方の操作で抑止を登録できると、強い相手を恒久的に回避できる。

## 3.4.4 作成してはならないテスト（拒否）

`reject-match` に関するテスト（旧 TC-MATCH-034〜046）は**削除する。** Function ごと廃止した（ADR-032 ②）。
`MATCH-007` は欠番であり、これを期待するテストを書いてはならない。

## 3.5 自動解決

| ID           | 観点            | 前提条件                            | 操作                   | 期待結果                            | 種別          | テスト名                                                    |
| ------------ | ------------- | ------------------------------- | -------------------- | ------------------------------- | ----------- | ------------------------------------------------------- |
| TC-MATCH-047 | 申告期限切れ        | `PLAYING`・`report_deadline_at` を経過 | auto-resolve-matches | `DRAWN` になる                     | Integration | `draws a match when the report deadline passes`         |
| TC-MATCH-048 | 解散時の勝者        | 解散後                             | matches取得            | `winner_team_id` がNULL          | Integration | `leaves the winner empty on a drawn match`              |
| TC-MATCH-049 | 解散時の確定日時      | 解散後                             | matches取得            | `completed_at` が設定される           | Integration | `sets completed_at when the match is drawn`             |
| TC-MATCH-050 | 解散時のレート       | 解散後                             | teams取得              | レートが変化しない                       | Integration | `does not change ratings on a drawn match`              |
| TC-MATCH-051 | 解散時の履歴        | 解散後                             | rating_history取得     | 作成されない                          | Integration | `does not write rating history for a drawn match`       |
| TC-MATCH-052 | 期限内の非対象       | `report_deadline_at` の前          | auto-resolve-matches | 状態が変化しない                        | Integration | `leaves matches within the deadline untouched`          |
| TC-MATCH-053 | 承認期限切れ        | `WINNER_REPORTED`・`approve_deadline_at` を経過 | auto-resolve-matches | `COMPLETED` になる                 | Integration | `auto-approves when the approval deadline passes`       |
| TC-MATCH-054 | 自動承認のフラグ      | 自動承認後                           | matches取得            | `auto_approved` が `true`         | Integration | `marks the match as auto-approved`                      |
| TC-MATCH-055 | 自動承認の承認者      | 自動承認後                           | matches取得            | `approved_by_profile_id` がNULL   | Integration | `leaves the approver empty on auto-approval`            |
| TC-MATCH-056 | 自動承認のレート更新    | 自動承認後                           | teams取得              | レートが更新される                       | Integration | `updates ratings on auto-approval`                      |
| TC-MATCH-057 | 自動承認の履歴       | 自動承認後                           | rating_history取得     | 2件作成される                         | Integration | `creates rating history on auto-approval`               |
| TC-MATCH-058 | 個別トランザクション    | 複数の対象があり1件が失敗                   | auto-resolve-matches | 他の試合の処理は継続される                   | Integration | `keeps processing other matches when one fails`         |
| TC-MATCH-059 | 多重起動の防止       | 同時に2回起動                         | auto-resolve-matches ×2 | 同一試合が二重に処理されない                  | Integration | `serialises concurrent auto-resolve runs`               |
| TC-MATCH-060 | 監査ログ          | 自動解決後                           | audit_logs取得         | `MATCH_DRAWN` または `MATCH_AUTO_APPROVED` が記録される | Integration | `records the auto resolution in the audit log`          |
| TC-MATCH-061 | Realtime通知    | 自動解決後                           | 通知確認                 | `MATCH_DRAWN` または `MATCH_COMPLETED` が送信される | Integration | `publishes the auto resolution event`                   |

| TC-MATCH-062 | **期限切れのクールダウン** | 報告期限切れの解散後                      | teams取得              | **両チーム**に設定される                 | Integration | `applies a cooldown to both teams on a report timeout`  |
| TC-MATCH-063 | **自動承認のクールダウン**  | 自動承認後                           | teams取得              | **放置した敗者側のみ**に設定される            | Integration | `applies the cooldown only to the team that went silent` |
| TC-MATCH-064 | 自動承認のクールダウン（勝者） | 自動承認後                           | teams取得              | 勝者側には設定されない                    | Integration | `does not penalise the winner on auto-approval`         |
| TC-MATCH-065 | `no_contest_reason` の設定 | 各経路での解散後                    | matches取得            | 経路に対応する値が入る                    | Integration | `records the reason for every drawn match`              |

## 3.5.1 確定率の集計（ADR-032 ⑥）

| ID           | 観点                     | 前提条件                       | 操作                   | 期待結果                   | 種別          | テスト名                                                |
| ------------ | ---------------------- | -------------------------- | -------------------- | ---------------------- | ----------- | --------------------------------------------------- |
| TC-MATCH-070 | 集計元が `matches` であること   | `DRAWN` が1件                | team_ranking_view取得  | `no_contests` が1になる    | Integration | `counts no-contests from the matches table`         |
| TC-MATCH-071 | `rating_history` は無関係  | `DRAWN` が1件                | rating_history取得     | 0件のまま                  | Integration | `writes no rating history for a drawn match`        |
| TC-MATCH-072 | 分母の構成                  | 確定3件・`REPORT_TIMEOUT` 1件   | team_ranking_view取得  | `settle_rate` が 0.75   | Integration | `computes the settle rate from settled and no-contests` |
| TC-MATCH-073 | **MUTUAL を分母に含めない**    | 確定3件・`MUTUAL` 1件           | team_ranking_view取得  | `settle_rate` が 1.0    | Integration | `excludes mutual no-contests from the settle rate`  |
| TC-MATCH-074 | **ADMIN_VOID を分母に含めない** | 確定3件・`ADMIN_VOID` 1件      | team_ranking_view取得  | `settle_rate` が 1.0    | Integration | `excludes admin voids from the settle rate`         |
| TC-MATCH-080 | **理由なしの DRAWN を拒む**     | 進行中の試合                    | 理由を設定せず DRAWN へ UPDATE | CHECK制約違反（23514）      | Database    | `finalize: rejects a drawn match without a no-contest reason` |
| TC-MATCH-081 | **シーズン終了の打ち切り**         | 猶予切れ時に進行中の試合が残る            | finalize と同じ UPDATE   | 成功し `SEASON_END` が入る   | Database    | `finalize: cuts off the remaining matches when the season ends` |
| TC-MATCH-082 | 打ち切りに勝者を残さない            | 同上                        | matches取得             | `winner_team_id` が NULL | Database    | `finalize: leaves no winner on a cut-off match`     |
| TC-MATCH-083 | **SEASON_END を不戦に数えない**  | `SEASON_END` 1件            | team_ranking_view取得   | `no_contests` が 0       | Database    | `finalize: never counts a season cutoff as a no-show` |
| TC-MATCH-084 | SEASON_END を不成立数に数えない    | 同上                        | team_ranking_view取得   | `void_count` が 0        | Database    | `finalize: keeps a season cutoff out of the mutual no-contest count` |
| TC-MATCH-085 | 未知の理由を拒む                | －                         | 不正な値へ UPDATE          | CHECK制約違反（23514）      | Database    | `finalize: still rejects an unknown no-contest reason` |

**TC-MATCH-080 と TC-MATCH-081 は Database Test でなければならない**（ADR-038 ⑥）。
Integration Test はモックDBを使うため CHECK制約が働かず、この不具合を検出できない。
実際に Migration 0023 が制約を追加した際、`finalize-season` の配線漏れが素通りし、
**猶予切れの時点で進行中の試合が1件でも残るとシーズンが確定できない**状態が続いた。

**★CHECK制約を追加するMigrationでは、その表へ書き込む全経路を洗うこと。**
`DRAWN` を書く箇所は5つあり、0023 はそのうち1つを見落とした。

## 3.x 管理者による対戦カードの作成（ADR-035 ⑤ / ADR-039）

| ID           | 観点                  | 前提条件                        | 操作                | 期待結果                                     | 種別          | テスト名                                                        |
| ------------ | ------------------- | --------------------------- | ----------------- | ---------------------------------------- | ----------- | ----------------------------------------------------------- |
| TC-MATCH-090 | 作成                  | 2チームを指定                     | admin-create-match | `PLAYING` の試合が作られる                       | Integration | `creates a PLAYING match for the two named teams`           |
| TC-MATCH-091 | 申告期限の設定             | 設定値90分                      | admin-create-match | `report_deadline_at` が設定される              | Integration | `always sets a report deadline from the settings`           |
| TC-MATCH-092 | **公平の仕組みを見ない**      | 通常                          | admin-create-match | `match_avoidance` / `queue_cooldown_until` / `match_rating_range` を問い合わせない | Integration | `never consults the fairness mechanisms of automatic matchmaking` |
| TC-MATCH-093 | **複数割り当て**          | 進行中の試合を持つチーム                | admin-create-match | 成功する。進行中の試合を数えない                         | Integration | `never rejects a team that already has a match in progress` |
| TC-MATCH-094 | 監査ログの区別             | 通常                          | audit_logs取得      | `MATCH_PREPARED` と実行者が記録される              | Integration | `records the preparation separately from an automatic match` |
| TC-MATCH-095 | Realtime            | 通常                          | 通知確認              | `MATCH_CREATED` が送信される                    | Integration | `publishes MATCH_CREATED so both teams refetch`             |
| TC-MATCH-096 | **確定処理中の拒否**        | `updates_locked`            | admin-create-match | `SEASON-001`。作成しない                        | Integration | `refuses to prepare a match while the season change is in progress` |
| TC-MATCH-097 | 猶予中の拒否              | `matchmaking_paused`        | admin-create-match | `SEASON-002`。作成しない                        | Integration | `refuses to prepare a match while matchmaking is paused for the season` |
| TC-MATCH-098 | 保守中の拒否              | `maintenance_paused`        | admin-create-match | `QUEUE-007`。作成しない                         | Integration | `refuses to prepare a match during maintenance`             |
| TC-MATCH-099 | BANチームの拒否           | 片方がBAN                      | admin-create-match | `TEAM-006`                                | Integration | `refuses a banned team`                                     |
| TC-MATCH-100 | **メンバー0人の拒否**       | 片方が無人                       | admin-create-match | `TEAM-011`                                | Integration | `refuses a team with no members`                            |
| TC-MATCH-101 | **人数の不揃いを許す**       | 3人 対 1人                     | admin-create-match | 成功する                                     | Integration | `allows an uneven roster`                                   |
| TC-MATCH-102 | 存在しないチーム            | 片方が存在しない                    | admin-create-match | `TEAM-001`                                | Integration | `refuses when one of the teams does not exist`              |
| TC-MATCH-103 | 自分自身との対戦            | 同一ID                        | admin-create-match | `VALIDATION-001`。SQLを発行しない                | Integration | `refuses to pair a team with itself`                        |
| TC-MATCH-104 | 入力不足                | `teamBId` 欠落                | admin-create-match | `VALIDATION-001`                          | Integration | `rejects a missing team id`                                 |
| TC-MATCH-105 | 権限                  | 一般利用者                       | admin-create-match | `ADMIN-001`。SQLを発行しない                     | Integration | `rejects a non-administrator`                               |

**TC-MATCH-092 と TC-MATCH-093 が本機能の中心である**（ADR-035 ⑤ / ADR-039 ②）。
大会では実力差のあるカードも、回線相性のあるペアも組む。1チームへの複数割り当てが目的である。
**問い合わせの有無で固定しているのは、参照するコードを足させないためである。**

**TC-MATCH-096〜098 は逆向きの境界である**（ADR-039 ③）。拘束されないのはペア単位・チーム単位の
公平の仕組みだけであり、停止は全体の宣言である。

**TC-MATCH-100 と TC-MATCH-101 を取り違えてはならない。** 無人は拒み、不揃いは許す。
前者は誰も報告できず相手を拘束するが、後者は運営が意図して組んだ対戦である（ADR-039 ④）。

| TC-MATCH-075 | 対象0件                   | 試合が無い                      | team_ranking_view取得  | `settle_rate` が NULL   | Integration | `returns null for a team with no matches`           |
| TC-MATCH-076 | `void_count` の別枠       | `MUTUAL` が2件               | team_ranking_view取得  | `void_count` が2        | Integration | `reports mutual no-contests separately`             |

TC-MATCH-073 と -074 は ADR-034 の要点である。**対戦そのものが成立しなかった試合を分母に混ぜると、
回線の相性が悪いだけのチームが不誠実に見える。**

## 3.6 状態遷移と不変条件（Database）

| ID           | 観点                        | 操作                                              | 期待結果       | 種別       | テスト名                                                       |
| ------------ | ------------------------- | ----------------------------------------------- | ---------- | -------- | ---------------------------------------------------------- |
| TC-MATCH-062 | 状態値の制限                    | `status = 'MATCHED'` を挿入                        | CHECK制約違反  | Database | `rejects a status value outside the four allowed states`   |
| TC-MATCH-063 | 同一チーム対戦の禁止                | `team_a_id = team_b_id` を挿入                     | CHECK制約違反  | Database | `rejects a match between a team and itself`                |
| TC-MATCH-064 | 勝者の妥当性                    | 参加外チームを `winner_team_id` に設定                    | CHECK制約違反  | Database | `rejects a winner outside the participating teams`         |
| TC-MATCH-065 | WINNER_REPORTED の必須項目     | `winner_team_id` をNULLのまま `WINNER_REPORTED` へ更新 | CHECK制約違反  | Database | `requires report fields in the WINNER_REPORTED state`      |
| TC-MATCH-066 | COMPLETED の必須項目           | `completed_at` をNULLのまま `COMPLETED` へ更新         | CHECK制約違反  | Database | `requires completed_at in the COMPLETED state`             |
| TC-MATCH-067 | COMPLETED の承認者            | 承認者もフラグもない状態で `COMPLETED` へ更新                   | CHECK制約違反  | Database | `requires an approver or the auto-approved flag`           |
| TC-MATCH-068 | 自動承認の許可                   | `auto_approved = true`・承認者NULLで `COMPLETED` へ更新 | 成功する       | Database | `allows a null approver when auto-approved`                |
| TC-MATCH-069 | DRAWN の勝者                 | `winner_team_id` を設定したまま `DRAWN` へ更新            | CHECK制約違反  | Database | `rejects a winner on a drawn match`                        |
| TC-MATCH-070 | PLAYING の申告情報             | 申告情報を残したまま `PLAYING` へ更新                        | CHECK制約違反  | Database | `requires empty report fields in the PLAYING state`        |
| TC-MATCH-071 | 履歴の一意性                    | 同一 `(match_id, team_id)` を2件挿入                  | UNIQUE制約違反 | Database | `rejects duplicate rating history for the same team`       |
| TC-MATCH-072 | `rating_change` の整合       | `after - before` と異なる値を挿入                       | CHECK制約違反  | Database | `rejects an inconsistent rating change`                    |

## 3.7 参照系

| ID           | 観点        | 前提条件      | 操作                | 期待結果                                   | 種別          | テスト名                                             |
| ------------ | --------- | --------- | ----------------- | -------------------------------------- | ----------- | ------------------------------------------------ |
| TC-MATCH-073 | 試合一覧      | 複数試合が存在   | match_list_view   | 一覧を取得できる                               | Integration | `lists matches`                                  |
| TC-MATCH-074 | 試合詳細      | 試合が存在     | match_detail_view | 申告者・承認者の表示名を含む                         | Integration | `returns the match detail with participant names` |
| TC-MATCH-075 | versionの提供 | 試合が存在     | match_detail_view | `version` が含まれる                        | Integration | `exposes the version for optimistic locking`     |
| TC-MATCH-076 | 期限の提供     | 試合が存在     | match_detail_view | `report_deadline_at`・`approve_deadline_at` が含まれる | Integration | `exposes the deadlines`                          |
| TC-MATCH-077 | 戦績の絞り込み   | 確定済みの試合   | Match History     | `COMPLETED` と `DRAWN` が対象となる           | Integration | `returns completed and drawn matches as history` |

---

# 4. 境界値

| 対象           | 境界値                                             |
| ------------ | ----------------------------------------------- |
| Match Status | PLAYING / WINNER_REPORTED / COMPLETED / DRAWN   |
| 延長回数         | 0 / 上限-1 / 上限 / 上限+1                            |
| 不成立の申請回数     | 0 / 上限-1 / 上限 / 上限+1                            |
| 無応答の満期       | 片方のみ満期 / 両方満期の直前 / ちょうど / 直後                   |
| 合意不成立の1日件数   | 上限-1 / 上限 / 上限+1                                |
| 抑止の有効期限      | 期限直前 / 期限ちょうど / 期限直後                            |
| 申告期限         | 期限直前 / 期限ちょうど / 期限直後                            |
| 承認期限         | 期限直前 / 期限ちょうど / 期限直後                            |
| version      | 一致 / 不一致                                        |

---

# 5. 異常系

* 存在しない試合ID
* 不正な状態遷移
* 権限のない申告・承認・拒否
* 二重申告・二重承認
* 楽観ロックの競合
* DB更新失敗
* Realtime送信失敗（ロールバックしないこと）
* 自動解決の多重起動

---

# 6. 作成してはならないテスト

| 対象                    | 理由                              |
| --------------------- | ------------------------------- |
| `status = 'IN_PROGRESS'` | 存在しない状態値（ADR-008）               |
| `finished_at` の検証     | 列が存在しない。`completed_at` を使用（ADR-002） |
| `match_results` テーブル  | 存在しないテーブル                       |
| 「勝者・敗者同一」の入力検証        | 申告DTOは `winnerTeamId` のみで敗者を指定しないため再現不能 |
| 状態遷移操作の「冪等性」          | 再送は業務エラーを返す。同一応答を期待しない（Part1 11章） |

---

# 7. AI実装ルール

* `report-match` はレートを更新しないことを検証する。
* レート更新は `approve-match` と自動承認のみで発生することを検証する。
* `DRAWN` ではレートを更新せず `rating_history` を作成しないことを検証する。
* 拒否時に `report_deadline_at` が再設定されることを必ず検証する（TC-MATCH-036、TC-MATCH-037）。
* 申告・承認・拒否がチームの任意のメンバーで実行できることを検証する（ADR-009）。
* 楽観ロックにより同時操作が1件のみ成功することを検証する。
* 状態遷移の不変条件は Database Test で検証する。
* 再送時に副作用が二重に発生しないことを検証する。
