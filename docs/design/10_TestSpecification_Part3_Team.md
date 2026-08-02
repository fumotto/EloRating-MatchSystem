# 10_TestSpecification_Part3_Team.md

# Test Specification — Part 3: チーム

Version: 2.0
Status: Active
Last Updated: 2026-08-03

方針は `10_TestSpecification.md`（Part1）を参照する。

---

# 1. 対象

* `profiles`（認証プロバイダ非依存）
* `teams`
* `team_members`（LEADER / MEMBER）
* `team_invites`（招待制）

対象Edge Function：`ensure-profile`、`create-team`、`create-team-invite`、`accept-team-invite`、`leave-team`、`transfer-leader`

---

# 2. 前提

* チームへの参加は招待制のみである（ADR-013）。`join-team` は存在しない。
* チーム代表者の呼称は **Leader** である（ADR-010）。`OWNER` は使用しない。
* チーム削除・チーム名変更はMVP対象外である。該当するテストは作成しない。
* BAN状態は `teams.is_banned`（真偽値）で表す。`status = 'BANNED'` という列は存在しない。

---

# 3. テストケース

## 3.1 プロフィール

| ID          | 観点          | 前提条件           | 操作             | 期待結果                                     | 種別          | テスト名                                                  |
| ----------- | ----------- | -------------- | -------------- | ---------------------------------------- | ----------- | ----------------------------------------------------- |
| TC-TEAM-001 | 初回作成        | 認証成功・プロフィール未作成 | ensure-profile | `profiles` が作成される                        | Integration | `creates a profile on first login`                    |
| TC-TEAM-002 | 再ログイン       | プロフィール作成済み     | ensure-profile | 重複作成されない                                 | Integration | `does not duplicate the profile on re-login`          |
| TC-TEAM-003 | 表示名の同期      | プロフィール作成済み     | ensure-profile | `display_name` が最新値へ更新される                | Integration | `syncs the display name from the provider`            |
| TC-TEAM-004 | プロバイダ識別     | 異なるプロバイダの同一ID  | ensure-profile | 別の利用者として扱われる                             | Integration | `treats the same provider id from another provider as a different user` |
| TC-TEAM-005 | プロバイダ情報の出所  | 改ざんされたリクエスト    | ensure-profile | `auth_provider` はJWTから取得され、入力値を信用しない     | Integration | `derives the provider from the JWT, not the request body` |
| TC-TEAM-006 | 表示名バリデーション  | 空文字／51文字       | ensure-profile | `VALIDATION-001` を返す                     | Integration | `rejects an invalid display name`                     |
| TC-TEAM-007 | 管理者フラグの非公開  | 一般利用者          | Profile Query  | `providerUserId` が応答に含まれない               | Integration | `does not expose the provider user id`                |

## 3.2 チーム作成

| ID          | 観点        | 前提条件      | 操作          | 期待結果                                   | 種別          | テスト名                                              |
| ----------- | --------- | --------- | ----------- | -------------------------------------- | ----------- | ------------------------------------------------- |
| TC-TEAM-008 | 正常作成      | 未所属ユーザー   | create-team | チームが作成される                              | Integration | `creates a team`                                  |
| TC-TEAM-009 | LEADER登録  | チーム作成直後   | team_members取得 | 作成者の `role` が `LEADER` である              | Integration | `registers the creator as the leader`             |
| TC-TEAM-010 | 初期レート     | チーム作成直後   | teams取得     | `system_settings.initial_rating` と一致    | Integration | `initializes the rating from system settings`     |
| TC-TEAM-011 | チーム名重複    | 同名チームが存在  | create-team | `TEAM-002` を返す                          | Integration | `rejects a duplicate team name`                   |
| TC-TEAM-012 | 名前の最小文字数  | 0文字       | create-team | `VALIDATION-001` を返す                    | Integration | `rejects an empty team name`                      |
| TC-TEAM-013 | 名前の最大文字数  | 31文字      | create-team | `VALIDATION-001` を返す                    | Integration | `rejects a team name longer than 30 characters`   |
| TC-TEAM-014 | 名前の境界値    | 1文字／30文字  | create-team | 作成に成功する                                | Integration | `accepts team names at the length boundaries`     |
| TC-TEAM-015 | 所属済みの拒否   | 既にチームへ所属  | create-team | `TEAM-003` を返す                          | Integration | `rejects team creation when already in a team`    |
| TC-TEAM-016 | トランザクション  | `team_members` 登録で例外 | create-team | `teams` の作成も取り消される                      | Integration | `rolls back the team when the leader row fails`   |
| TC-TEAM-017 | 監査ログ      | チーム作成後    | audit_logs取得 | `TEAM_CREATED` が記録される                   | Integration | `records team creation in the audit log`          |

## 3.3 招待

| ID          | 観点            | 前提条件               | 操作                 | 期待結果                                    | 種別          | テスト名                                                    |
| ----------- | ------------- | ------------------ | ------------------ | --------------------------------------- | ----------- | ------------------------------------------------------- |
| TC-TEAM-018 | 招待発行          | LEADER             | create-team-invite | 招待コードと有効期限が返却される                        | Integration | `issues an invite code`                                 |
| TC-TEAM-019 | 平文の非保存        | 招待発行後              | team_invites取得     | `invite_code_hash` のみ保存され、平文が存在しない      | Integration | `stores only the hash of the invite code`               |
| TC-TEAM-020 | 有効な招待の一意性     | 有効な招待が存在           | create-team-invite | 旧招待が `REVOKED` となり、新しい招待が1件だけ `ACTIVE` になる | Integration | `revokes the previous invite when issuing a new one`    |
| TC-TEAM-021 | 非LEADERの拒否    | MEMBER             | create-team-invite | `TEAM-005` を返す                          | Integration | `rejects invite creation by a non-leader`               |
| TC-TEAM-022 | 満員時の拒否        | 人数上限に到達            | create-team-invite | `TEAM-004` を返す                          | Integration | `rejects invite creation when the team is full`         |
| TC-TEAM-023 | BANチームの拒否     | BAN済み              | create-team-invite | `TEAM-006` を返す                          | Integration | `rejects invite creation for a banned team`             |
| TC-TEAM-024 | 有効期限の設定       | 招待発行後              | team_invites取得     | `expires_at` が `invite_expiration_hours` に基づく | Integration | `sets the expiry from system settings`                  |
| TC-TEAM-025 | 正常参加          | 有効な招待・未所属ユーザー      | accept-team-invite | メンバーが追加され、招待が `USED` になる                | Integration | `adds the member and marks the invite as used`          |
| TC-TEAM-026 | 参加者の役割        | 招待参加後              | team_members取得     | `role` が `MEMBER` である                    | Integration | `joins as a member, not a leader`                       |
| TC-TEAM-027 | 無効なコード        | 存在しないコード           | accept-team-invite | `INVITE-001` を返す                        | Integration | `rejects an unknown invite code`                        |
| TC-TEAM-028 | 期限切れ          | `expires_at` を過ぎた招待 | accept-team-invite | `INVITE-002` を返す                        | Integration | `rejects an expired invite`                             |
| TC-TEAM-029 | 使用済み          | `USED` の招待         | accept-team-invite | `INVITE-003` を返す                        | Integration | `rejects an already used invite`                        |
| TC-TEAM-030 | 取り消し済み        | `REVOKED` の招待      | accept-team-invite | `INVITE-004` を返す                        | Integration | `rejects a revoked invite`                              |
| TC-TEAM-031 | 所属済みの拒否       | 既にチームへ所属           | accept-team-invite | `TEAM-003` を返す                          | Integration | `rejects joining while already in a team`               |
| TC-TEAM-032 | 満員時の拒否        | 人数上限に到達            | accept-team-invite | `TEAM-004` を返す                          | Integration | `rejects joining a full team`                           |
| TC-TEAM-033 | BANチームへの参加拒否  | BAN済み              | accept-team-invite | `TEAM-006` を返す                          | Integration | `rejects joining a banned team`                         |
| TC-TEAM-034 | **同時参加による定員超過** | 上限まで残り1名・2名が同時に参加 | accept-team-invite ×2 | 1名のみ成功し、もう1名は `TEAM-004`。人数は上限を超えない     | Integration | `prevents exceeding the member limit under concurrency` |
| TC-TEAM-035 | 境界値（上限ちょうど）   | 上限まで残り1名           | accept-team-invite | 参加に成功する                                 | Integration | `accepts the member that fills the last slot`           |

## 3.4 脱退

| ID          | 観点            | 前提条件                  | 操作         | 期待結果                        | 種別          | テスト名                                                    |
| ----------- | ------------- | --------------------- | ---------- | --------------------------- | ----------- | ------------------------------------------------------- |
| TC-TEAM-036 | 通常脱退          | MEMBER・進行中の試合なし       | leave-team | `team_members` から削除される      | Integration | `lets a member leave the team`                          |
| TC-TEAM-037 | 試合中の拒否        | 進行中の試合が存在             | leave-team | `TEAM-007` を返す              | Integration | `rejects leaving while a match is in progress`          |
| TC-TEAM-038 | LEADERの拒否     | LEADER・他メンバーが存在       | leave-team | `TEAM-008` を返す              | Integration | `requires a leader transfer before leaving`             |
| TC-TEAM-039 | LEADER単独の脱退   | LEADER・他メンバーなし        | leave-team | 脱退に成功し、チームはメンバー0人で残存する      | Integration | `allows the last leader to leave`                       |
| TC-TEAM-040 | 非所属           | チーム未所属                | leave-team | `TEAM-010` を返す              | Integration | `rejects leaving when not in a team`                    |
| TC-TEAM-041 | 待機中の脱退        | マッチング待機中・進行中の試合なし     | leave-team | 脱退が成功し、`matching_queue` からも削除される | Integration | `removes the team from the queue when the leader leaves` |
| TC-TEAM-042 | DRAWN後の脱退     | 直前の試合が `DRAWN` で終了    | leave-team | 脱退に成功する（進行中とみなさない）          | Integration | `allows leaving after the match was drawn`              |

## 3.5 リーダー移譲

| ID          | 観点         | 前提条件            | 操作              | 期待結果                            | 種別          | テスト名                                                  |
| ----------- | ---------- | --------------- | --------------- | ------------------------------- | ----------- | ----------------------------------------------------- |
| TC-TEAM-043 | 正常移譲       | LEADER・他メンバーが存在 | transfer-leader | 役割が入れ替わる                        | Integration | `transfers the leader role`                           |
| TC-TEAM-044 | LEADERの一意性 | 移譲後             | team_members取得  | チーム内の `LEADER` はちょうど1人          | Integration | `keeps exactly one leader per team`                   |
| TC-TEAM-045 | 更新順序       | 移譲実行            | transfer-leader | 部分UNIQUEインデックス違反が発生しない          | Integration | `demotes the current leader before promoting the new one` |
| TC-TEAM-046 | 非LEADER    | MEMBERが実行       | transfer-leader | `TEAM-005` を返す                  | Integration | `rejects a transfer by a non-leader`                  |
| TC-TEAM-047 | 他チームへの移譲   | 別チームのメンバーを指定    | transfer-leader | `TEAM-009` を返す                  | Integration | `rejects transferring to a member of another team`    |
| TC-TEAM-048 | 自己譲渡       | 自分自身を指定         | transfer-leader | `TEAM-009` を返す                  | Integration | `rejects transferring to yourself`                    |
| TC-TEAM-049 | 存在しない対象    | 無効なprofileId    | transfer-leader | `TEAM-009` を返す                  | Integration | `rejects transferring to an unknown profile`          |

## 3.6 制約（Database）

| ID          | 観点            | 操作                             | 期待結果            | 種別       | テスト名                                                   |
| ----------- | ------------- | ------------------------------ | --------------- | -------- | ------------------------------------------------------ |
| TC-TEAM-050 | 1人1チーム        | 同一 `profile_id` で2件目を挿入        | UNIQUE制約違反      | Database | `rejects a second team membership for the same profile` |
| TC-TEAM-051 | LEADERの一意性    | 同一チームに2人目の `LEADER` を挿入        | 部分UNIQUE制約違反    | Database | `rejects a second leader in the same team`             |
| TC-TEAM-052 | 有効な招待の一意性     | 同一チームに2件目の `ACTIVE` 招待を挿入      | 部分UNIQUE制約違反    | Database | `rejects a second active invite for the same team`     |
| TC-TEAM-053 | 招待コードの一意性     | 重複する `invite_code_hash` を挿入    | UNIQUE制約違反      | Database | `rejects a duplicate invite code hash`                 |
| TC-TEAM-054 | 役割の値          | `role = 'OWNER'` を挿入           | CHECK制約違反       | Database | `rejects a role value outside LEADER and MEMBER`       |
| TC-TEAM-055 | 招待の期限         | `expires_at <= created_at` を挿入 | CHECK制約違反       | Database | `rejects an invite expiring before it was created`     |
| TC-TEAM-056 | プロバイダの値       | 未定義のプロバイダを挿入                   | CHECK制約違反       | Database | `rejects an unsupported auth provider`                 |
| TC-TEAM-057 | プロバイダIDの組み合わせ | 同一 `(provider, id)` を2件挿入      | UNIQUE制約違反      | Database | `rejects a duplicate provider identity`                |

---

# 4. 境界値

| 対象      | 境界値                    |
| ------- | ---------------------- |
| チーム名    | 0 / 1 / 30 / 31 文字     |
| 表示名     | 0 / 1 / 50 / 51 文字     |
| チーム人数   | 上限-1 / 上限 / 上限+1       |
| 招待の有効期限 | 期限直前 / 期限直後            |

---

# 5. 異常系

* 存在しないチームへの操作
* 無効・期限切れ・使用済み・取り消し済みの招待
* 重複参加
* 権限のないリーダー操作
* BANチームへの操作
* 試合中の脱退
* 同時参加による定員超過

---

# 6. 作成してはならないテスト

以下はMVP対象外であるため、テストを作成しない。

| 対象      | 理由                                    |
| ------- | ------------------------------------- |
| チーム削除   | `03_Database.md` によりチームは削除しない         |
| チーム名変更  | MVP対象外                                |
| `join-team` | 存在しないFunction。参加は招待制のみ（ADR-013）       |
| `transfer-owner` | `transfer-leader` へ改称（ADR-010）      |

---

# 7. AI実装ルール

* チーム作成は `teams` と `team_members` を同一トランザクションで作成することを検証する。
* 招待受諾では人数上限・重複所属・有効期限・BAN状態をすべて検証する。
* 同時参加による定員超過が発生しないことを必ず検証する。
* 招待コードが平文で保存されていないことを検証する。
* LEADER限定の操作は権限チェックを必ず検証する。
* 制約（UNIQUE・部分UNIQUE・CHECK）は Database Test で検証する。
* 用語は `Leader` を使用する。`OWNER` を使用しない。
