# 10_TestSpecification_Part5_Match.md

# Test Specification — Part 5: 試合

Version: 2.0
Status: Active
Last Updated: 2026-08-03

方針は `10_TestSpecification.md`（Part1）を参照する。

---

# 1. 対象

* `matches`
* `report-match`
* `approve-match`
* `reject-match`
* `auto-resolve-matches`
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

## 3.4 拒否

| ID           | 観点            | 前提条件                   | 操作           | 期待結果                                        | 種別          | テスト名                                                      |
| ------------ | ------------- | ---------------------- | ------------ | ------------------------------------------- | ----------- | --------------------------------------------------------- |
| TC-MATCH-034 | 正常拒否          | `WINNER_REPORTED`・敗者メンバー | reject-match | `PLAYING` へ戻る                               | Integration | `returns the match to PLAYING on rejection`               |
| TC-MATCH-035 | 申告情報のクリア      | 拒否後                    | matches取得    | `winner_team_id`・`reported_by_profile_id`・`reported_at`・`approve_deadline_at` がNULL | Integration | `clears the report fields on rejection`                   |
| TC-MATCH-036 | **期限の再設定**    | 拒否後                    | matches取得    | `report_deadline_at` が `now + report_timeout_minutes` へ更新される | Integration | `extends the report deadline on rejection`                |
| TC-MATCH-037 | **期限切れ直前の拒否** | `report_deadline_at` を既に経過した状態で拒否 | reject-match → auto-resolve-matches | 直後の自動解決でDRAWNにならない                          | Integration | `does not immediately draw a match that was just rejected` |
| TC-MATCH-038 | 拒否回数の加算       | 拒否後                    | matches取得    | `reject_count` が1増える                        | Integration | `increments the reject count`                             |
| TC-MATCH-039 | 再申告           | 拒否後                    | report-match | 再び申告できる                                     | Integration | `allows reporting again after a rejection`                |
| TC-MATCH-040 | 上限到達での解散      | `reject_count` が上限に到達  | reject-match | `DRAWN` になり、`result` は `OK`                 | Integration | `draws the match when the reject limit is reached`        |
| TC-MATCH-041 | 上限到達時のレート     | 上限到達での解散後              | teams取得      | レートが変化しない                                   | Integration | `does not change ratings when drawn by rejections`        |
| TC-MATCH-042 | 勝者による拒否の拒絶    | 勝者チームのメンバー             | reject-match | `MATCH-005` を返す                             | Integration | `rejects a rejection from the winning team`               |
| TC-MATCH-043 | 未申告での拒否       | `PLAYING`              | reject-match | `MATCH-004` を返す                             | Integration | `rejects a rejection before the winner is reported`       |
| TC-MATCH-044 | 解散済みへの拒否      | `DRAWN`                | reject-match | `MATCH-002` を返す                             | Integration | `rejects a rejection on a drawn match`                    |
| TC-MATCH-045 | Realtime通知    | 拒否後                    | 通知確認         | `MATCH_REJECTED`（上限到達時は `MATCH_DRAWN`）が送信される | Integration | `publishes the rejection event`                           |
| TC-MATCH-046 | 監査ログ          | 拒否後                    | audit_logs取得 | `MATCH_REJECTED` が記録される                     | Integration | `records the rejection in the audit log`                  |

TC-MATCH-037 は重要である。拒否時に `report_deadline_at` を再設定しない実装では、`PLAYING` へ戻した直後に自動解決バッチが `DRAWN` にしてしまう。

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
| 拒否回数         | 0 / 上限-1 / 上限 / 上限+1                            |
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
