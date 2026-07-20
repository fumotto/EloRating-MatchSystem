# 10_TestSpecification.md

## Part3

# Team Domain Tests

---

# 1. 対象

本章では Team Aggregate に関するテストケースを定義する。

対象

* profiles
* teams
* team_members
* team_invites

---

# 2. テストケース

| ID       | 観点          | 前提条件       | 確認方法              | 期待結果             | 自動化         | テストメソッド名                                                    |
| -------- | ----------- | ---------- | ----------------- | ---------------- | ----------- | ----------------------------------------------------------- |
| TEAM-001 | プロフィール自動作成  | Steam認証成功  | profiles取得        | プロフィールが作成される     | Integration | `test_api_should_create_profile_after_login`                |
| TEAM-002 | プロフィール再ログイン | 既存プロフィールあり | ログイン実行            | 重複作成されない         | Integration | `test_api_should_not_duplicate_profile`                     |
| TEAM-003 | チーム作成       | 未所属ユーザー    | create-team実行     | チームが作成される        | Integration | `test_api_should_create_team`                               |
| TEAM-004 | チーム名重複禁止    | 同名チーム存在    | create-team実行     | エラーを返す           | Integration | `test_api_should_reject_duplicate_team_name`                |
| TEAM-005 | チーム名最小文字数   | 最小文字数未満    | create-team実行     | バリデーションエラー       | Integration | `test_api_should_validate_team_name_min_length`             |
| TEAM-006 | チーム名最大文字数   | 最大文字数超過    | create-team実行     | バリデーションエラー       | Integration | `test_api_should_validate_team_name_max_length`             |
| TEAM-007 | 未所属制約       | 既に所属中      | create-team実行     | チーム作成不可          | Integration | `test_api_should_reject_team_creation_when_already_member`  |
| TEAM-008 | リーダー登録      | チーム作成直後    | team_members取得    | 作成者がLeaderになる    | Integration | `test_api_should_register_creator_as_leader`                |
| TEAM-009 | 初期レート       | チーム作成      | teams取得           | rating=1500      | Integration | `test_api_should_initialize_team_rating`                    |
| TEAM-010 | 招待発行        | Leader権限   | invite生成          | 招待コードが発行される      | Integration | `test_api_should_create_team_invite`                        |
| TEAM-011 | 招待受諾        | 有効な招待      | accept-invite実行   | メンバー追加           | Integration | `test_api_should_accept_team_invite`                        |
| TEAM-012 | 期限切れ招待      | 期限切れ状態     | accept-invite実行   | 招待拒否             | Integration | `test_api_should_reject_expired_invite`                     |
| TEAM-013 | 無効招待コード     | 存在しないコード   | accept-invite実行   | 招待拒否             | Integration | `test_api_should_reject_invalid_invite_code`                |
| TEAM-014 | 重複参加防止      | 既存メンバー     | accept-invite実行   | 重複登録されない         | Integration | `test_api_should_prevent_duplicate_team_membership`         |
| TEAM-015 | 最大人数        | 人数上限到達     | accept-invite実行   | 参加拒否             | Integration | `test_api_should_reject_join_when_team_is_full`             |
| TEAM-016 | 招待失効        | 使用済み招待     | accept-invite実行   | 再利用不可            | Integration | `test_api_should_invalidate_used_invite`                    |
| TEAM-017 | メンバー脱退      | 一般メンバー     | leave-team実行      | team_membersから削除 | Integration | `test_api_should_allow_member_to_leave_team`                |
| TEAM-018 | リーダー脱退制御    | Leaderのみ所属 | leave-team実行      | 脱退拒否             | Integration | `test_api_should_reject_last_leader_leave`                  |
| TEAM-019 | リーダー権限移譲    | 複数メンバー所属   | transfer-leader実行 | Leader変更         | Integration | `test_api_should_transfer_team_leader`                      |
| TEAM-020 | 権限なし移譲      | 一般メンバー     | transfer-leader実行 | 権限エラー            | Integration | `test_api_should_reject_leader_transfer_without_permission` |
| TEAM-021 | チーム削除       | メンバー0人     | delete-team実行     | teams削除          | Integration | `test_api_should_delete_empty_team`                         |
| TEAM-022 | 削除制約        | 所属メンバーあり   | delete-team実行     | 削除拒否             | Integration | `test_api_should_reject_delete_non_empty_team`              |
| TEAM-023 | チームBAN      | 管理者実行      | BAN設定             | status=BANNED    | Integration | `test_api_should_ban_team`                                  |
| TEAM-024 | BAN解除       | BAN済み      | 解除実行              | ACTIVEへ戻る        | Integration | `test_api_should_unban_team`                                |
| TEAM-025 | BAN中招待禁止    | BANチーム     | invite生成          | 作成不可             | Integration | `test_api_should_reject_invite_for_banned_team`             |
| TEAM-026 | BAN中マッチング禁止 | BANチーム     | queue登録           | 登録拒否             | Integration | `test_api_should_reject_queue_for_banned_team`              |
| TEAM-027 | 他チーム取得      | 他チーム存在     | get-team実行        | 公開情報のみ取得         | Integration | `test_api_should_return_public_team_information`            |
| TEAM-028 | プロフィール更新    | 本人         | update-profile実行  | プロフィール更新成功       | Integration | `test_api_should_update_own_profile`                        |
| TEAM-029 | 他人プロフィール更新  | 他ユーザー      | update-profile実行  | 権限エラー            | Security    | `test_rls_should_reject_other_profile_update`               |
| TEAM-030 | チーム一覧取得     | 複数チーム存在    | get-teams実行       | 一覧取得成功           | Integration | `test_api_should_list_teams`                                |

---

# 3. 境界値テスト

| 対象     | 境界値              |
| ------ | ---------------- |
| チーム名   | 最小文字数・最大文字数      |
| チーム人数  | 0人・1人・上限人数・上限+1人 |
| 招待コード  | 有効期限直前・期限切れ直後    |
| プロフィール | 空文字・最大文字数        |

---

# 4. 異常系テスト

以下を必ず実施する。

* 存在しないチームへの参加
* 存在しないプロフィール更新
* 無効な招待コード
* 期限切れ招待
* 重複参加
* 権限なしのリーダー操作
* BANチームへの操作
* 削除済みチームへのアクセス

---

# 5. AI実装ルール

* Team Aggregate はトランザクション整合性を維持すること。
* チーム作成時は `teams` と `team_members` を同一トランザクションで作成すること。
* 招待受諾時は人数上限・重複所属・招待有効期限を必ず検証すること。
* Leader 権限が必要なAPIは権限チェックを必ず実施すること。
* Integration TestではDB更新結果まで確認すること。
* Security TestではRLSによる拒否を確認すること。
