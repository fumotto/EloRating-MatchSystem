# 10_TestSpecification.md

## Part8

# Security / RLS Tests

---

# 1. 対象

本章では認証・認可・RLS（Row Level Security）・データ保護・監査機能に関するテストケースを定義する。

対象

* Supabase Auth
* RLS Policies
* Edge Functions
* Profiles
* Teams
* Team Members
* Team Invites
* Matches
* Rating History
* Audit Log

---

# 2. テストケース

## 2.1 Authentication

| ID      | 観点        | 前提条件     | 確認方法  | 期待結果             | 自動化      | テストメソッド名                                         |
| ------- | --------- | -------- | ----- | ---------------- | -------- | ------------------------------------------------ |
| SEC-001 | 未ログインアクセス | 認証なし     | API実行 | 401 Unauthorized | Security | `test_rls_should_reject_unauthenticated_request` |
| SEC-002 | 期限切れトークン  | 期限切れJWT  | API実行 | 401 Unauthorized | Security | `test_rls_should_reject_expired_token`           |
| SEC-003 | 改ざんトークン   | 不正JWT    | API実行 | 401 Unauthorized | Security | `test_rls_should_reject_tampered_token`          |
| SEC-004 | 存在しないユーザー | 削除済みユーザー | API実行 | 401 Unauthorized | Security | `test_rls_should_reject_deleted_user`            |
| SEC-005 | 認証成功      | 有効JWT    | API実行 | 認証成功             | Security | `test_rls_should_allow_authenticated_request`    |

---

## 2.2 Profile / Team Authorization

| ID      | 観点         | 前提条件   | 確認方法  | 期待結果          | 自動化      | テストメソッド名                                           |
| ------- | ---------- | ------ | ----- | ------------- | -------- | -------------------------------------------------- |
| SEC-006 | 自プロフィール更新  | 本人     | 更新API | 成功            | Security | `test_rls_should_allow_own_profile_update`         |
| SEC-007 | 他人プロフィール更新 | 他ユーザー  | 更新API | 403 Forbidden | Security | `test_rls_should_reject_other_profile_update`      |
| SEC-008 | 自チーム更新     | Leader | 更新API | 成功            | Security | `test_rls_should_allow_team_leader_update`         |
| SEC-009 | 一般メンバー更新   | Member | 更新API | 403 Forbidden | Security | `test_rls_should_reject_member_team_update`        |
| SEC-010 | 他チーム更新     | 別チーム   | 更新API | 403 Forbidden | Security | `test_rls_should_reject_other_team_update`         |
| SEC-011 | チーム削除      | Leader | 削除API | 成功            | Security | `test_rls_should_allow_team_delete_when_permitted` |
| SEC-012 | 他チーム削除     | 別チーム   | 削除API | 403 Forbidden | Security | `test_rls_should_reject_other_team_delete`         |

---

## 2.3 Match Authorization

| ID      | 観点       | 前提条件      | 確認方法          | 期待結果          | 自動化      | テストメソッド名                                        |
| ------- | -------- | --------- | ------------- | ------------- | -------- | ----------------------------------------------- |
| SEC-013 | 勝者報告     | 勝者チーム     | report-match  | 成功            | Security | `test_rls_should_allow_winner_report`           |
| SEC-014 | 敗者報告     | 敗者チーム     | report-match  | 403 Forbidden | Security | `test_rls_should_reject_loser_report`           |
| SEC-015 | 敗者承認     | 敗者チーム     | approve-match | 成功            | Security | `test_rls_should_allow_loser_approval`          |
| SEC-016 | 第三者承認    | 無関係チーム    | approve-match | 403 Forbidden | Security | `test_rls_should_reject_third_party_approval`   |
| SEC-017 | 完了済み試合更新 | COMPLETED | API実行         | 更新拒否          | Security | `test_rls_should_reject_completed_match_update` |
| SEC-018 | 他人試合取得   | 無関係試合     | 取得API         | 公開範囲のみ取得      | Security | `test_rls_should_limit_match_visibility`        |

---

## 2.4 Team Invite Protection

| ID      | 観点       | 前提条件   | 確認方法  | 期待結果          | 自動化      | テストメソッド名                                          |
| ------- | -------- | ------ | ----- | ------------- | -------- | ------------------------------------------------- |
| SEC-019 | 招待コード閲覧  | Leader | 取得API | 成功            | Security | `test_rls_should_allow_leader_to_view_invites`    |
| SEC-020 | 他チーム招待閲覧 | 別チーム   | 取得API | 403 Forbidden | Security | `test_rls_should_reject_other_team_invite_access` |
| SEC-021 | 期限切れ招待   | 期限切れ   | 利用API | 拒否            | Security | `test_rls_should_reject_expired_invite_usage`     |
| SEC-022 | 使用済み招待   | 使用済み   | 利用API | 拒否            | Security | `test_rls_should_reject_used_invite_usage`        |

---

## 2.5 Admin Authorization

| ID      | 観点          | 前提条件   | 確認方法 | 期待結果          | 自動化      | テストメソッド名                                     |
| ------- | ----------- | ------ | ---- | ------------- | -------- | -------------------------------------------- |
| SEC-023 | 管理API       | 管理者    | 実行   | 成功            | Security | `test_rls_should_allow_admin_operation`      |
| SEC-024 | 一般ユーザー管理API | 一般ユーザー | 実行   | 403 Forbidden | Security | `test_rls_should_reject_non_admin_operation` |
| SEC-025 | 管理者BAN      | 管理者    | BAN  | 成功            | Security | `test_rls_should_allow_admin_ban`            |
| SEC-026 | 一般BAN       | 一般ユーザー | BAN  | 403 Forbidden | Security | `test_rls_should_reject_non_admin_ban`       |

---

## 2.6 Data Protection

| ID      | 観点               | 前提条件    | 確認方法    | 期待結果          | 自動化      | テストメソッド名                                      |
| ------- | ---------------- | ------- | ------- | ------------- | -------- | --------------------------------------------- |
| SEC-027 | 非公開カラム           | 取得API   | レスポンス確認 | 機密情報を返さない     | Security | `test_rls_should_hide_private_columns`        |
| SEC-028 | 監査ログ閲覧           | 一般ユーザー  | 取得API   | 403 Forbidden | Security | `test_rls_should_reject_audit_log_access`     |
| SEC-029 | Rating History取得 | 一般ユーザー  | 取得API   | 公開仕様どおり       | Security | `test_rls_should_limit_rating_history_access` |
| SEC-030 | BANチーム情報         | ランキング取得 | 取得API   | 非表示項目が保護される   | Security | `test_rls_should_protect_banned_team_data`    |

---

## 2.7 Tampering / Replay Protection

| ID      | 観点          | 前提条件        | 確認方法  | 期待結果          | 自動化      | テストメソッド名                                    |
| ------- | ----------- | ----------- | ----- | ------------- | -------- | ------------------------------------------- |
| SEC-031 | Team ID改ざん  | 他Team ID指定  | API実行 | 403 Forbidden | Security | `test_rls_should_reject_team_id_tampering`  |
| SEC-032 | User ID改ざん  | 他User ID指定  | API実行 | 403 Forbidden | Security | `test_rls_should_reject_user_id_tampering`  |
| SEC-033 | Match ID改ざん | 他Match ID指定 | API実行 | 403 Forbidden | Security | `test_rls_should_reject_match_id_tampering` |
| SEC-034 | 二重送信        | 同一リクエスト再送   | API実行 | 冪等性維持         | Security | `test_rls_should_handle_duplicate_requests` |
| SEC-035 | 大量リクエスト     | 短時間連続送信     | API実行 | 仕様どおり処理       | Security | `test_rls_should_handle_request_flooding`   |

---

## 2.8 Audit

| ID      | 観点        | 前提条件   | 確認方法  | 期待結果          | 自動化      | テストメソッド名                                        |
| ------- | --------- | ------ | ----- | ------------- | -------- | ----------------------------------------------- |
| SEC-036 | 管理操作記録    | 管理操作   | 監査ログ  | 記録される         | Security | `test_rls_should_record_admin_actions`          |
| SEC-037 | 認証失敗記録    | 不正JWT  | 監査ログ  | 記録される         | Security | `test_rls_should_record_failed_authentication`  |
| SEC-038 | 権限違反記録    | 403発生  | 監査ログ  | 記録される         | Security | `test_rls_should_record_authorization_failure`  |
| SEC-039 | 更新履歴      | 更新API  | 監査ログ  | 更新内容を保持       | Security | `test_rls_should_record_data_changes`           |
| SEC-040 | 監査ログ改ざん防止 | 一般ユーザー | 更新API | 403 Forbidden | Security | `test_rls_should_reject_audit_log_modification` |

---

# 3. AI実装ルール

* **すべてのテーブルでRLSを有効化する。**
* クライアントからの直接更新を前提とせず、必要に応じてEdge Functions経由で権限を集約する。
* RLSは「許可されること」だけでなく「拒否されること」を必ずテストする。
* Security Testは成功ケースと失敗ケースを対で実装する。
* 監査ログは更新・削除不可とし、追記専用とする。
* 冪等性を考慮し、リプレイ攻撃による状態破壊を防止する。
