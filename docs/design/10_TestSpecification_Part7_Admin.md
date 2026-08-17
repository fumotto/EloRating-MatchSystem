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
| TC-ADMIN-025 | 承認期限の変更       | 10分          | admin-update-system-settings | 5 が保存され、以後の申告に反映される             | Integration | `updates the approval timeout`                          |
| TC-ADMIN-026 | 拒否上限の変更       | 2回           | admin-update-system-settings | 1 が保存され、以後の拒否に反映される             | Integration | `updates the reject limit`                              |
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
