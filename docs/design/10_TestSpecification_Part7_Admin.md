# 10_TestSpecification_Part7_Admin.md

# Test Specification — Part 7: 管理機能

Version: 2.0
Status: Active
Last Updated: 2026-08-03

方針は `10_TestSpecification.md`（Part1）を参照する。

---

# 1. 対象

* `admin-ban-team` / `admin-unban-team`
* `admin-update-system-settings`
* `audit_logs`

---

# 2. 前提

* 管理者判定はJWTの `app_metadata.role` による（`03_Database.md` 9.1、ADR-020）。DBに管理者フラグの列は存在しない。
* 管理者の付与はSupabase側で行う。アプリケーションに登録・昇格機能は存在しないため、その種のテストは作成しない。
* BAN状態は `teams.is_banned` で表す。`status = 'BANNED'` という列は存在しない。
* すべての管理操作は `audit_logs` へ記録する（ADR-017）。
* 管理操作は冪等とする。同じ結果をもたらす再送は成功を返す（`06_ErrorCode.md` 15章）。

---

# 3. テストケース

## 3.1 認可

| ID           | 観点          | 前提条件        | 操作     | 期待結果            | 種別          | テスト名                                        |
| ------------ | ----------- | ----------- | ------ | --------------- | ----------- | ------------------------------------------- |
| TC-ADMIN-001 | 管理者の許可      | `app_metadata.role = 'admin'` | 管理API実行 | 成功する            | Integration | `allows an administrator`                   |
| TC-ADMIN-002 | 一般利用者の拒否    | ロール未設定                        | 管理API実行 | `ADMIN-001` を返す | Integration | `rejects a non-administrator`               |
| TC-ADMIN-003 | 未認証の拒否      | 認証なし                          | 管理API実行 | `AUTH-001` を返す  | Integration | `rejects an unauthenticated request`        |
| TC-ADMIN-004 | メタデータの改ざん防止 | 一般利用者                         | クライアントSDKから `app_metadata` の更新を試行 | 変更できない | Integration | `prevents a user from granting themselves admin` |
| TC-ADMIN-005 | 偽装ロールの拒否    | ボディに `role: admin` を含めたリクエスト   | 管理API実行 | `ADMIN-001` を返す（JWTのみを信用する） | Integration | `ignores a role supplied in the request body` |

TC-ADMIN-004・TC-ADMIN-005 は重要である。`app_metadata` は service_role でのみ更新可能であるため自己昇格は構造的に不可能だが、その前提が実装で崩れていないことを確認する。

またEdge FunctionがリクエストボディのロールをJWTより優先すると認可が破られるため、TC-ADMIN-005 で検証する。

## 3.2 チームBAN

| ID           | 観点          | 前提条件         | 操作               | 期待結果                      | 種別          | テスト名                                              |
| ------------ | ----------- | ------------ | ---------------- | ------------------------- | ----------- | ------------------------------------------------- |
| TC-ADMIN-005 | 正常BAN       | BANされていないチーム | admin-ban-team   | `is_banned` が `true` になる  | Integration | `bans a team`                                     |
| TC-ADMIN-006 | 待機の解除       | 待機中のチームをBAN  | admin-ban-team   | `matching_queue` から削除される  | Integration | `removes a banned team from the queue`            |
| TC-ADMIN-007 | 進行中試合の継続    | 試合中のチームをBAN  | admin-ban-team   | 試合は中断されない                 | Integration | `does not interrupt an in-progress match`         |
| TC-ADMIN-008 | BAN後のマッチング  | BAN後         | queue-match      | `TEAM-006` を返す            | Integration | `blocks matchmaking for a banned team`            |
| TC-ADMIN-009 | BAN後の招待発行   | BAN後         | create-team-invite | `TEAM-006` を返す            | Integration | `blocks invites for a banned team`                |
| TC-ADMIN-010 | 二重BAN       | BAN済み        | admin-ban-team   | 成功を返し、状態は変化しない            | Integration | `treats a repeated ban as a no-op`                |
| TC-ADMIN-011 | 存在しないチーム    | 無効なteamId    | admin-ban-team   | `TEAM-001` を返す            | Integration | `returns not found for an unknown team`           |
| TC-ADMIN-012 | 理由のバリデーション  | 空文字／501文字    | admin-ban-team   | `VALIDATION-001` を返す      | Integration | `requires a reason between 1 and 500 characters`  |
| TC-ADMIN-013 | BAN解除       | BAN済み        | admin-unban-team | `is_banned` が `false` になる | Integration | `lifts the ban`                                   |
| TC-ADMIN-014 | 二重解除        | BANされていないチーム | admin-unban-team | 成功を返し、状態は変化しない            | Integration | `treats a repeated unban as a no-op`              |
| TC-ADMIN-015 | Realtime通知  | BAN／解除後      | 通知確認             | `TEAM_UPDATED` が送信される     | Integration | `publishes TEAM_UPDATED`                          |

## 3.3 システム設定

| ID           | 観点            | 前提条件         | 操作                           | 期待結果                            | 種別          | テスト名                                                    |
| ------------ | ------------- | ------------ | ---------------------------- | ------------------------------- | ----------- | ------------------------------------------------------- |
| TC-ADMIN-016 | 設定取得          | 認証済み         | System Settings Query        | 現在の設定を返す                        | Integration | `returns the current system settings`                   |
| TC-ADMIN-017 | 一般利用者の参照      | 一般利用者        | System Settings Query        | 取得できる（人数上限・期限の表示に必要）            | Integration | `lets any authenticated user read the settings`         |
| TC-ADMIN-018 | K値の変更         | K=32         | admin-update-system-settings | K=64 が保存される                     | Integration | `updates the K factor`                                  |
| TC-ADMIN-019 | 人数上限の変更       | 上限=3         | admin-update-system-settings | 上限=5 が保存される                     | Integration | `updates the member limit`                              |
| TC-ADMIN-020 | 新上限の適用        | 上限変更後        | accept-team-invite           | 新しい上限で判定される                     | Integration | `applies the new member limit to joins`                 |
| TC-ADMIN-021 | **上限の縮小**     | 上限=5、5人在籍のチーム | admin-update-system-settings（上限=3） | 設定は成功し、既存メンバーは強制脱退されない          | Integration | `does not evict existing members when the limit shrinks` |
| TC-ADMIN-022 | 縮小後の新規参加      | 上限縮小後、在籍が上限超過 | accept-team-invite           | `TEAM-004` を返す                  | Integration | `blocks new joins when the team exceeds the new limit`  |
| TC-ADMIN-023 | 許容レート差の変更     | 400          | admin-update-system-settings | 200 が保存され、マッチングに反映される           | Integration | `updates the matchmaking rating range`                  |
| TC-ADMIN-024 | 申告期限の変更       | 60分          | admin-update-system-settings | 30 が保存され、以後のマッチに反映される           | Integration | `updates the report timeout`                            |
| TC-ADMIN-025 | 承認期限の変更       | 60分          | admin-update-system-settings | 5 が保存され、以後の申告に反映される             | Integration | `updates the approval timeout`                          |
| ~~TC-ADMIN-026~~ | ~~拒否上限の変更~~   | －            | －                            | **廃止**（ADR-032 ③）。拒否そのものが無い           | －           | －                                                       |
| TC-ADMIN-027 | 招待期限の変更       | 24時間         | admin-update-system-settings | 48 が保存される                       | Integration | `updates the invite expiration`                         |
| TC-ADMIN-028 | 部分更新          | 一部の項目のみ指定    | admin-update-system-settings | 指定した項目のみ更新される                   | Integration | `updates only the provided fields`                      |
| TC-ADMIN-029 | K値の下限違反       | K=0          | admin-update-system-settings | `ADMIN-002` を返す                 | Integration | `rejects a K factor below the minimum`                  |
| TC-ADMIN-030 | K値の上限違反       | K=129        | admin-update-system-settings | `ADMIN-002` を返す                 | Integration | `rejects a K factor above the maximum`                  |
| TC-ADMIN-031 | K値の境界値        | K=1 / K=128  | admin-update-system-settings | 保存に成功する                         | Integration | `accepts the K factor boundaries`                       |
| TC-ADMIN-032 | 人数上限の下限違反     | 上限=1         | admin-update-system-settings | `ADMIN-002` を返す                 | Integration | `rejects a member limit of one`                         |
| TC-ADMIN-033 | 人数上限の境界値      | 上限=2         | admin-update-system-settings | 保存に成功する                         | Integration | `accepts a member limit of two`                         |
| TC-ADMIN-034 | 負数・NULLの拒否    | 各項目に負数       | admin-update-system-settings | `ADMIN-002` を返す                 | Integration | `rejects negative setting values`                       |
| TC-ADMIN-035 | 冪等性           | 同一値を再送       | admin-update-system-settings | 成功を返し、状態は変化しない                  | Integration | `treats an identical update as a no-op`                 |
| TC-ADMIN-036 | Realtime通知    | 設定変更後        | 通知確認                         | `SYSTEM_SETTINGS_UPDATED` が送信される | Integration | `publishes SYSTEM_SETTINGS_UPDATED`                     |
| TC-ADMIN-037 | 制約による最終防御     | 直接UPDATE     | system_settings UPDATE       | CHECK制約違反となる                    | Database    | `rejects invalid settings at the database level`        |

人数上限を縮小した場合の扱い（TC-ADMIN-021、TC-ADMIN-022）は `04_BackendInterface.md` 12.3 の規定に従う。

## 3.3.1 通報（ADR-033）

| ID            | 観点                    | 前提条件                    | 操作                         | 期待結果                                   | 種別          | テスト名                                                   |
| ------------- | --------------------- | ----------------------- | -------------------------- | -------------------------------------- | ----------- | ------------------------------------------------------ |
| TC-ADMIN-201  | 正常登録                  | 認証済み・チーム所属              | create-abuse-report        | `OPEN` で登録される                          | Integration | `creates an abuse report`                              |
| TC-ADMIN-202  | **無所属からの登録**          | チームに属さない利用者             | create-abuse-report        | 成功し、`reporter_team_id` が NULL          | Integration | `accepts a report from a user without a team`          |
| TC-ADMIN-203  | **所属チームの詐称不可**        | 別チームIDを body に混ぜる       | create-abuse-report        | 無視され、JWT から導出される                       | Integration | `derives the reporter team from the JWT only`          |
| TC-ADMIN-204  | 自チーム宛の拒否              | 対象が自チーム                 | create-abuse-report        | `ABUSE-002` を返す                        | Integration | `rejects a report against the reporter's own team`     |
| TC-ADMIN-205  | 自由記述の下限               | 9文字                     | create-abuse-report        | `VALIDATION-001` を返す                   | Integration | `rejects a detail shorter than 10 characters`          |
| TC-ADMIN-206  | 自由記述の上限               | 1001文字                  | create-abuse-report        | `VALIDATION-001` を返す                   | Integration | `rejects a detail longer than 1000 characters`         |
| TC-ADMIN-207  | 証拠URLの件数超過            | 4件                      | create-abuse-report        | `VALIDATION-001` を返す                   | Integration | `rejects more than three evidence urls`                |
| TC-ADMIN-208  | 非https の証拠URL         | `http://`               | create-abuse-report        | `VALIDATION-001` を返す                   | Integration | `rejects a non-https evidence url`                     |
| TC-ADMIN-209  | **証拠なしで登録できる**        | `evidenceUrls` 省略       | create-abuse-report        | 成功する                                   | Integration | `accepts a report without evidence`                    |
| TC-ADMIN-210  | 同一試合への重複              | 同一チーム・同一対象・同一試合         | create-abuse-report ×2     | 2件目が `ABUSE-003`                       | Integration | `rejects a duplicate report for the same match`        |
| TC-ADMIN-211  | 取り下げ後の再通報             | 取り下げ済み                  | create-abuse-report        | 成功する                                   | Integration | `allows reporting again after a withdrawal`            |
| TC-ADMIN-212  | 試合なしの頻度制限             | 24時間以内に同一対象へ            | create-abuse-report        | `ABUSE-004` を返す                        | Integration | `rejects a second match-less report within 24 hours`   |
| TC-ADMIN-213  | **第三者による通報**          | 当該試合の参加チームでない            | create-abuse-report        | 成功する                                   | Integration | `accepts a report from a non-participant`              |
| TC-ADMIN-214  | **試合に影響しない**          | 進行中の試合を関連付けて通報          | matches取得                  | 状態もレートも変わらない                           | Integration | `leaves the match untouched when reported`             |
| TC-ADMIN-215  | **シーズン切替中でも通報できる**    | `updates_locked = TRUE` | create-abuse-report        | 成功する                                   | Integration | `accepts reports while season updates are locked`      |
| TC-ADMIN-216  | Realtime通知なし          | 通報後                     | 通知確認                       | 何も送信されない                               | Integration | `publishes nothing on report creation`                 |
| TC-ADMIN-217  | 取り下げ                  | 自分の `OPEN` の通報          | withdraw-abuse-report      | `WITHDRAWN` になる                        | Integration | `withdraws the reporter's own report`                  |
| TC-ADMIN-218  | 他人の通報の取り下げ            | 別利用者の通報                 | withdraw-abuse-report      | `ABUSE-007` を返す                        | Integration | `rejects withdrawing someone else's report`            |
| TC-ADMIN-219  | 処理済みの取り下げ             | `NO_ACTION`             | withdraw-abuse-report      | `ABUSE-006` を返す                        | Integration | `rejects withdrawing a resolved report`                |
| TC-ADMIN-220  | 措置：NO_ACTION          | `OPEN`                  | admin-resolve-abuse-report | `NO_ACTION` で閉じる                       | Integration | `closes a report without action`                       |
| TC-ADMIN-221  | 措置：COOLDOWN           | `OPEN`                  | admin-resolve-abuse-report | `queue_cooldown_until` が設定される          | Integration | `applies a cooldown as a sanction`                     |
| TC-ADMIN-222  | 措置：BANNED             | `OPEN`                  | admin-resolve-abuse-report | `is_banned = TRUE` になる                 | Integration | `bans the team as a sanction`                          |
| TC-ADMIN-223  | **確定した試合に触れない**       | 関連試合が `COMPLETED`       | admin-resolve-abuse-report | 勝敗もレートも変わらない                           | Integration | `never modifies a completed match`                     |
| TC-ADMIN-224  | 二重措置の拒否               | 処理済み                    | admin-resolve-abuse-report | `ABUSE-006` を返す                        | Integration | `rejects resolving a report twice`                     |
| TC-ADMIN-225  | 非管理者                  | 一般利用者                   | admin-resolve-abuse-report | `AUTH-004` を返す                         | Integration | `rejects a non-admin resolution`                       |
| TC-ADMIN-226  | **通報の非公開**            | 通報後                     | team_ranking_view取得        | 通報に関する列が存在しない                          | Integration | `never exposes reports through the ranking view`       |
| TC-ADMIN-227  | **対象は自分への通報を見られない**   | 通報後                     | 対象チームとして abuse_reports を参照 | 0件                                     | Integration | `hides reports from the reported team`                 |
| TC-ADMIN-228  | 通報者は自分の通報を見られる        | 通報後                     | 通報者として abuse_reports を参照   | 自分の通報のみ返る                              | Integration | `lets the reporter see their own reports`              |
| TC-ADMIN-229  | 累積：通報元チーム数            | 3チームから計5件               | abuse_report_aggregate_view | `m=3`、`n=5`                            | Integration | `counts distinct reporter teams`                       |
| TC-ADMIN-230  | **累積：無所属は m に数えない**   | 無所属から2件                 | abuse_report_aggregate_view | `m` が増えない                              | Integration | `excludes teamless reporters from the team count`      |
| TC-ADMIN-231  | 累積：取り下げの除外            | 取り下げ済みを含む               | abuse_report_aggregate_view | 取り下げ分が数えられない                           | Integration | `excludes withdrawn reports from the aggregate`        |

TC-ADMIN-203 は最重要である。`reporterTeamId` を入力から受け取る実装では、**通報元チーム数 `m` を偽装でき、
ADR-033 ④ の判断材料が壊れる。**

TC-ADMIN-223 は ADR-033 ① の検証である。**通報から結果への経路は存在してはならない。**

## 3.3.2 試合の無効化（ADR-034 ④）

| ID           | 観点                | 前提条件                              | 操作                 | 期待結果                                 | 種別          | テスト名                                                |
| ------------ | ----------------- | --------------------------------- | ------------------ | ------------------------------------ | ----------- | --------------------------------------------------- |
| TC-ADMIN-240 | 個別の無効化            | `PLAYING`                         | admin-void-match   | `DRAWN` / `ADMIN_VOID`               | Integration | `voids a single match`                              |
| TC-ADMIN-241 | **クールダウン無し**      | 無効化後                              | teams取得            | 両チームとも設定されない                         | Integration | `applies no cooldown when voiding`                  |
| TC-ADMIN-242 | **確定率に不計上**       | 無効化後                              | team_ranking_view取得 | `no_contests` が増えない                  | Integration | `excludes a voided match from the settle rate`      |
| TC-ADMIN-243 | レート不変             | 無効化後                              | teams取得            | 変化しない                                | Integration | `does not change ratings when voiding`              |
| TC-ADMIN-244 | 一括の既定対象           | `PLAYING` と `WINNER_REPORTED` が混在 | admin-void-matches | `PLAYING` のみ無効化される                   | Integration | `voids only PLAYING matches by default`             |
| TC-ADMIN-245 | 一括の対象拡大           | `includeReported: true`           | admin-void-matches | `WINNER_REPORTED` も無効化される            | Integration | `includes reported matches when asked`              |
| TC-ADMIN-246 | 理由の必須             | `reason` 省略                       | admin-void-matches | `VALIDATION-001` を返す                 | Integration | `requires a reason for voiding`                     |
| TC-ADMIN-247 | 監査ログ              | 無効化後                              | audit_logs取得       | `MATCH_VOIDED` と理由が記録される             | Integration | `records the void with its reason`                  |
| TC-ADMIN-248 | 非管理者              | 一般利用者                             | admin-void-match   | `AUTH-004` を返す                       | Integration | `rejects a non-admin void`                          |

## 3.3.3 対戦の偏り（ADR-036 ④）

| ID           | 観点                | 前提条件                    | 操作                     | 期待結果                                | 種別       | テスト名                                                        |
| ------------ | ----------------- | ----------------------- | ---------------------- | ----------------------------------- | -------- | ----------------------------------------------------------- |
| TC-ADMIN-260 | 非管理者への非公開（ペア）     | 一般利用者                   | suspicious_pair_view   | 0件が返る                               | Database | `hides the suspicious pairs from a non-administrator`       |
| TC-ADMIN-261 | 非管理者への非公開（チーム）    | 一般利用者                   | team_integrity_view    | 0件が返る                               | Database | `hides the team bias figures from a non-administrator`      |
| TC-ADMIN-262 | 対象の絞り込み           | 確定1件のペアと2件以上のペアが混在      | suspicious_pair_view   | 2件以上のペアのみが返る                        | Database | `reports only the pairs that met twice or more`             |
| TC-ADMIN-263 | 一方向性              | 同じチームが全勝しているペア          | suspicious_pair_view   | `one_sided_ratio` が 1.0 になる          | Database | `scores a pair with no reversed result as fully one-sided`  |
| TC-ADMIN-264 | 同時在席あり            | 一方のチームが他の試合に出ており時間が重なる  | suspicious_pair_view   | `never_concurrent` が FALSE           | Database | `does not flag a pair whose matches overlapped in time`     |
| TC-ADMIN-265 | **同時在席の欠如**       | 両チームが互いとしか対戦していない       | suspicious_pair_view   | `never_concurrent` が TRUE            | Database | `flags a pair that was never online at the same time`       |
| TC-ADMIN-266 | 稼ぎ先の特定            | 複数の相手から獲得している           | team_integrity_view    | `top_opponent_id` が最大の稼ぎ先と一致する      | Database | `names the opponent that supplied the most rating`          |
| TC-ADMIN-267 | 集中の割合             | 複数の相手から獲得している           | team_integrity_view    | `top_opponent_gain_share` が比率と一致する   | Database | `measures how concentrated the rating gain is`              |

**TC-ADMIN-260 / 261 は必須である。** 疑いを全員に晒すと、機構がそのまま公開の告発になる。
基表 `matches` は認証済みなら誰でも読めるため、`security_invoker` だけでは絞れない。
View 自身の管理者述語が唯一の遮断である（`03_Database.md` 11.8）。

**TC-ADMIN-265 が本機構の中心である。** 人はふたつのチームを同時に操作できない。
IPを変えても回線を分けても、この痕跡は消えない。

## 3.4 監査ログ

| ID           | 観点             | 前提条件      | 操作             | 期待結果                                | 種別          | テスト名                                                |
| ------------ | -------------- | --------- | -------------- | ----------------------------------- | ----------- | --------------------------------------------------- |
| TC-ADMIN-047 | BANの記録         | BAN実行後    | audit_logs取得   | `TEAM_BANNED` が記録される                | Integration | `records a ban`                                     |
| TC-ADMIN-048 | 理由の記録          | BAN実行後    | audit_logs取得   | `payload` に理由が含まれる                  | Integration | `stores the ban reason in the payload`              |
| TC-ADMIN-049 | 設定変更の記録        | 設定変更後     | audit_logs取得   | `SETTINGS_UPDATED` と変更前後の値が記録される    | Integration | `records the setting change with before and after`  |
| TC-ADMIN-051 | 操作者の記録         | 管理操作後     | audit_logs取得   | `actor_profile_id` が実行者と一致する        | Integration | `records who performed the action`                  |
| TC-ADMIN-052 | システム操作の記録      | 自動解決後     | audit_logs取得   | `actor_profile_id` がNULLである         | Integration | `records a null actor for system actions`           |
| TC-ADMIN-053 | 参照権限           | 管理者       | Audit Logs Query | 取得できる                               | Integration | `lets an administrator read the audit log`          |
| TC-ADMIN-054 | 一般利用者の参照拒否     | 一般利用者     | Audit Logs Query | 取得できない                              | Database    | `hides the audit log from regular users`            |
| TC-ADMIN-055 | 追記専用（更新）       | 管理者       | audit_logs UPDATE | 拒否される                               | Database    | `rejects updates to the audit log`                  |
| TC-ADMIN-056 | 追記専用（削除）       | 管理者       | audit_logs DELETE | 拒否される                               | Database    | `rejects deletes from the audit log`                |
| TC-ADMIN-057 | 秘密情報の非記録       | 各種操作後     | audit_logs取得   | トークン・招待コードの平文が含まれない                 | Integration | `never stores secrets in the audit log`             |
| TC-ADMIN-058 | 記録失敗時の業務継続     | 監査ログ書込みが失敗 | 管理操作           | 業務処理は完了する                           | Integration | `does not fail the operation when audit logging fails` |

## 3.6 トランザクション

| ID           | 観点       | 前提条件        | 操作             | 期待結果             | 種別          | テスト名                                              |
| ------------ | -------- | ----------- | -------------- | ---------------- | ----------- | ------------------------------------------------- |
| TC-ADMIN-059 | コミット     | 正常終了        | admin-ban-team | すべての更新が反映される     | Integration | `commits the ban and queue removal together`      |
| TC-ADMIN-060 | ロールバック   | 途中で例外       | admin-ban-team | すべての更新が取り消される    | Integration | `rolls back every write when one step fails`      |
| TC-ADMIN-061 | 同時更新     | 2つの設定変更が同時実行 | admin-update-system-settings ×2 | 不整合な状態にならない | Integration | `serialises concurrent setting updates`           |

## 3.7 サブアカウント対策の ON/OFF（ADR-036 ⑤）

| ID           | 観点         | 前提条件                          | 操作                           | 期待結果                    | 種別          | テスト名                                        |
| ------------ | ---------- | ----------------------------- | ---------------------------- | ----------------------- | ----------- | ------------------------------------------- |
| TC-ADMIN-270 | 抑止の無効化     | `rematchCooldownHours: 0`     | admin-update-system-settings | 受理され、0 が保存される           | Integration | `accepts zero for the rematch cooldown`     |
| TC-ADMIN-271 | 掲載条件の無効化   | `rankingMinOpponents: 0`      | admin-update-system-settings | 受理され、0 が保存される           | Integration | `accepts zero for the ranking threshold`    |
| TC-ADMIN-272 | 負値の拒否      | `rematchCooldownHours: -1`    | admin-update-system-settings | `ADMIN-002` を返す          | Integration | `rejects a negative rematch cooldown`       |

**★環境変数でこれを切るテストを書いてはならない**（ADR-036 ⑤）。Edge Function の環境変数は
テストから切り替えられず、E2E は同じ Supabase を共有する。ON/OFF は設定値のみである。

## 3.8 設定の編集可能範囲（ADR-037）

| ID           | 観点                 | 前提条件                                              | 操作                           | 期待結果                          | 種別          | テスト名                                            |
| ------------ | ------------------ | ------------------------------------------------- | ---------------------------- | ----------------------------- | ----------- | ----------------------------------------------- |
| TC-ADMIN-280 | 確定方式の設定の配線         | `queueCooldownMinutes: 45`                        | admin-update-system-settings | 該当列が更新される                     | Integration | `updates the settings added for the report flow` |
| TC-ADMIN-281 | 保守停止を立てる           | `maintenancePaused: true`                         | admin-update-system-settings | `maintenance_paused` が TRUE になる | Integration | `turns the maintenance pause on`                |
| TC-ADMIN-282 | **保守停止を解除する**      | `maintenancePaused: false`                        | admin-update-system-settings | `maintenance_paused` が FALSE になる | Integration | `turns the maintenance pause off`               |
| TC-ADMIN-283 | 真偽値以外の拒否           | `maintenancePaused: "true"`                       | admin-update-system-settings | `ADMIN-002` を返す                | Integration | `rejects a non-boolean maintenance pause`       |
| TC-ADMIN-284 | **シーズン状態の非編集**     | `matchmakingPaused` / `updatesLocked` / `currentSeason` | admin-update-system-settings | いずれも `ADMIN-002`、UPDATE を発行しない | Integration | `never touches the season state columns`        |
| TC-ADMIN-285 | **有効な項目への混入**      | `{ ratingK, matchmakingPaused }`                  | admin-update-system-settings | 成功するが `matchmaking_paused` はSQLに現れない | Integration | `ignores a season state column mixed into a valid update` |

**TC-ADMIN-282 が最も落とし穴である。** `false` を「未指定」と取り違えると保守停止を解除できなくなる。
判定は `value === undefined` で行う。

**TC-ADMIN-285 が実際に起きる形である。** 単独で送った場合（284）だけを検証していると、
有効な項目へ紛れ込ませる経路を見落とす。

**TC-ADMIN-284 を消してはならない。** シーズン運用の3列を汎用の設定APIから触れると、
シーズン切替の途中で状態を壊せるうえ、ADR-034 ⑤ が `maintenance_paused` を別列にした意味が失われる。

**★設定を追加したら、その列のテストをここへ足す**（ADR-037 ⑥）。
実際に ADR-032〜034 の10列は、テストが無いまま配線漏れが放置された。

---

# 4. 境界値

| 対象      | 境界値                     |
| ------- | ----------------------- |
| K値      | 0 / 1 / 32 / 128 / 129  |
| チーム人数上限 | 1 / 2 / 標準 / 大きい値       |
| 初期レート   | 99 / 100 / 1500         |
| 許容レート差  | 0 / 1 / 400             |
| 各種期限    | 0 / 1 / 標準値             |
| 拒否上限    | 0 / 1 / 2               |
| BAN理由   | 0 / 1 / 500 / 501 文字    |

`0` はCHECK制約により拒否される値として検証する（TC-ADMIN-029、TC-ADMIN-032）。

---

# 4.1 廃止した観点

TC-ADMIN-038〜046（レートリセット）および TC-ADMIN-050 は、`admin-reset-ratings` の
廃止に伴い削除した（ADR-031）。**番号は再利用しない。** 過去の参照が別の観点を指すようになる。
レートの初期化はシーズンリセットの観点で検証する（TC-SEASON-005・006）。

---

# 5. 異常系

* 権限のない管理操作
* 存在しないチームへの操作
* 不正な設定値
* DB更新失敗・トランザクション失敗
* 二重リクエスト
* 同時更新の競合

---

# 6. AI実装ルール

* すべての管理APIで管理者権限を検証する。
* 利用者が自身の `app_metadata` を変更できないことを必ず検証する。
* 管理者判定にリクエストボディの値を使わず、検証済みJWTのクレームのみを信用することを検証する。
* 設定変更はトランザクションで実行されることを検証する。
* K値の変更が完了時点の試合に適用されることを検証する（Part2 TC-RATING-027）。
* すべての管理操作が `audit_logs` へ記録されることを検証する。
* 監査ログが更新・削除できないことを Database Test で検証する。
* 管理APIの冪等性を検証する。
* **設定を追加したら、その列を更新するテストを必ず足す**（ADR-037 ⑥）。
  実際に ADR-032〜034 の10列は、テストが無いまま配線漏れが放置された。
* 真偽値の設定は「立てる」「解除する」「真偽値以外を拒否する」の3つを検証する。
  `false` を未指定と取り違えると解除できなくなる。
* シーズン運用の列（`matchmaking_paused` / `updates_locked` / `current_season`）が
  `admin-update-system-settings` から編集できないことを検証する（ADR-037 ②）。
