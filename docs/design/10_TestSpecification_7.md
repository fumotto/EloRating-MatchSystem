# 10_TestSpecification.md

## Part7

# Admin Tests

---

# 1. 対象

本章では管理者機能のテストケースを定義する。

対象

* Team Management
* Rating Settings
* Team Settings
* System Settings
* Audit Log

---

# 2. テストケース

| ID        | 観点          | 前提条件      | 確認方法             | 期待結果          | 自動化         | テストメソッド名                                                       |
| --------- | ----------- | --------- | ---------------- | ------------- | ----------- | -------------------------------------------------------------- |
| ADMIN-001 | 管理者認証       | 管理者アカウント  | 管理API実行          | 操作成功          | Integration | `test_api_should_allow_admin_access`                           |
| ADMIN-002 | 一般ユーザー拒否    | 一般ユーザー    | 管理API実行          | 403エラー        | Security    | `test_rls_should_reject_non_admin_access`                      |
| ADMIN-003 | チームBAN      | ACTIVEチーム | BAN実行            | status=BANNED | Integration | `test_api_should_ban_team`                                     |
| ADMIN-004 | BAN解除       | BAN済みチーム  | 解除実行             | status=ACTIVE | Integration | `test_api_should_unban_team`                                   |
| ADMIN-005 | 二重BAN防止     | BAN済みチーム  | BAN実行            | 状態が変化しない      | Integration | `test_api_should_ignore_duplicate_ban`                         |
| ADMIN-006 | 存在しないチームBAN | 無効Team ID | BAN実行            | 404エラー        | Integration | `test_api_should_return_not_found_when_banning_unknown_team`   |
| ADMIN-007 | K値変更        | K=32→64   | 設定変更             | 新K値が保存される     | Integration | `test_api_should_update_k_factor`                              |
| ADMIN-008 | K値反映        | K変更後      | 試合終了             | 新K値で計算される     | Integration | `test_api_should_apply_updated_k_factor_to_new_matches`        |
| ADMIN-009 | K値境界(最小)    | 最小値未満     | 設定変更             | バリデーションエラー    | Integration | `test_api_should_validate_k_factor_min`                        |
| ADMIN-010 | K値境界(最大)    | 最大値超過     | 設定変更             | バリデーションエラー    | Integration | `test_api_should_validate_k_factor_max`                        |
| ADMIN-011 | レートリセット     | 複数チーム存在   | リセット実行           | 全チーム1500になる   | Integration | `test_api_should_reset_all_team_ratings`                       |
| ADMIN-012 | 履歴保持        | レートリセット後  | rating_history確認 | 履歴が保持される      | Integration | `test_api_should_preserve_rating_history_after_reset`          |
| ADMIN-013 | チーム人数上限変更   | 上限変更      | 設定取得             | 新しい上限値が反映される  | Integration | `test_api_should_update_team_member_limit`                     |
| ADMIN-014 | 新上限適用       | 上限変更後     | 招待受諾             | 新上限で判定される     | Integration | `test_api_should_apply_updated_team_member_limit`              |
| ADMIN-015 | 監査ログ        | 管理操作実行    | 監査ログ確認           | 操作履歴が記録される    | Integration | `test_api_should_record_admin_audit_log`                       |
| ADMIN-016 | トランザクション    | 複数設定変更    | DB確認             | 全更新または全ロールバック | Integration | `test_api_should_commit_or_rollback_admin_transaction`         |
| ADMIN-017 | Realtime通知  | 設定変更      | 通知確認             | 必要なイベントが送信される | Integration | `test_api_should_publish_admin_setting_changed_event`          |
| ADMIN-018 | 設定取得        | 管理画面表示    | 設定取得API          | 現在設定を返す       | Integration | `test_api_should_return_system_settings`                       |
| ADMIN-019 | 不正設定値       | 負数・NULL等  | 設定変更             | 400エラー        | Integration | `test_api_should_reject_invalid_system_settings`               |
| ADMIN-020 | 冪等性         | 同一設定を再送   | 設定変更             | 状態が変化しない      | Integration | `test_api_should_handle_duplicate_admin_requests_idempotently` |

---

# 3. 境界値テスト

| 対象      | 境界値           |
| ------- | ------------- |
| K値      | 最小値・32・最大値    |
| チーム人数上限 | 1・標準値・最大値     |
| BAN状態   | ACTIVE⇔BANNED |

---

# 4. 異常系テスト

以下を必ず実施する。

* 権限なしの管理操作
* 存在しないチームへの操作
* 不正な設定値
* DB更新失敗
* トランザクション失敗
* Realtime通知失敗
* 二重リクエスト
* 同時更新競合

---

# 5. AI実装ルール

* すべての管理APIは管理者権限を必須とする。
* 設定変更はトランザクションで実行する。
* K値変更は未終了試合には影響を与えず、新規に完了する試合から適用する。
* レートリセットは`rating_history`を削除しない。
* すべての管理操作は監査ログへ記録する。
* 管理APIは冪等性を考慮して実装する。
