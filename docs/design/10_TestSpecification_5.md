# 10_TestSpecification.md

## Part5

# Match Tests

---

# 1. 対象

本章では試合管理機能のテストケースを定義する。

対象

* matches
* report-match
* approve-match
* match_results
* rating_history
* completed_at
* Realtime通知

---

# 2. テストケース

| ID        | 観点               | 前提条件                                  | 確認方法              | 期待結果                            | 自動化         | テストメソッド名                                                         |
| --------- | ---------------- | ------------------------------------- | ----------------- | ------------------------------- | ----------- | ---------------------------------------------------------------- |
| MATCH-001 | 試合作成             | マッチ成立                                 | matches取得         | 試合が作成される                        | Integration | `test_api_should_create_match`                                   |
| MATCH-002 | 試合状態初期値          | 試合作成直後                                | matches取得         | status=IN_PROGRESS              | Integration | `test_api_should_initialize_match_status`                        |
| MATCH-003 | 勝者報告             | 試合中                                   | report-match実行    | WINNER_REPORTEDになる              | Integration | `test_api_should_report_match_result`                            |
| MATCH-004 | 敗者承認             | 勝者報告済み                                | approve-match実行   | COMPLETEDになる                    | Integration | `test_api_should_approve_match_result`                           |
| MATCH-005 | レート更新            | 承認完了                                  | teams取得           | レート更新される                        | Integration | `test_api_should_update_team_ratings`                            |
| MATCH-006 | completed_at     | 承認完了                                  | matches取得         | completed_atが設定される              | Integration | `test_api_should_set_completed_at`                               |
| MATCH-007 | rating_history生成 | 承認完了                                  | rating_history取得  | 2件登録される                         | Integration | `test_api_should_create_rating_history`                          |
| MATCH-008 | 二重報告防止           | 勝者報告済み                                | report-match再実行   | エラーを返す                          | Integration | `test_api_should_prevent_duplicate_match_report`                 |
| MATCH-009 | 二重承認防止           | COMPLETED                             | approve-match実行   | エラーを返す                          | Integration | `test_api_should_prevent_duplicate_match_approval`               |
| MATCH-010 | 敗者以外承認           | 第三者                                   | approve-match実行   | 権限エラー                           | Security    | `test_rls_should_reject_non_loser_approval`                      |
| MATCH-011 | 勝者以外報告           | 第三者                                   | report-match実行    | 権限エラー                           | Security    | `test_rls_should_reject_non_winner_report`                       |
| MATCH-012 | 存在しない試合          | 無効ID                                  | report-match実行    | 404エラー                          | Integration | `test_api_should_return_not_found_for_invalid_match`             |
| MATCH-013 | 試合中再マッチ禁止        | 試合中                                   | queue-match実行     | 登録拒否                            | Integration | `test_api_should_reject_queue_while_match_in_progress`           |
| MATCH-014 | Realtime通知       | 試合終了                                  | 通知確認              | MATCH_COMPLETED送信               | Integration | `test_api_should_publish_match_completed_event`                  |
| MATCH-015 | トランザクション成功       | 正常終了                                  | DB確認              | 全更新が反映される                       | Integration | `test_api_should_commit_match_transaction`                       |
| MATCH-016 | トランザクション失敗       | 途中例外                                  | DB確認              | 全更新をロールバック                      | Integration | `test_api_should_rollback_match_transaction`                     |
| MATCH-017 | 勝敗整合性            | 勝者・敗者指定                               | DB確認              | team_a/team_b結果が一致              | Integration | `test_api_should_store_consistent_match_result`                  |
| MATCH-018 | 同時承認競合           | 同時approve                             | DB確認              | 1回のみ成功                          | Integration | `test_api_should_prevent_concurrent_match_approval`              |
| MATCH-019 | 試合履歴取得           | 試合終了済み                                | get-match-history | 履歴取得成功                          | Integration | `test_api_should_return_match_history`                           |
| MATCH-020 | 試合詳細取得           | 試合終了済み                                | get-match-detail  | 詳細取得成功                          | Integration | `test_api_should_return_match_detail`                            |
| MATCH-021 | 試合一覧取得           | 複数試合                                  | list-matches      | 一覧取得成功                          | Integration | `test_api_should_list_matches`                                   |
| MATCH-022 | 勝敗未報告            | IN_PROGRESS                           | get-match         | 未報告状態を返す                        | Integration | `test_api_should_return_unreported_match_state`                  |
| MATCH-023 | 勝者・敗者同一          | 不正入力                                  | report-match実行    | バリデーションエラー                      | Integration | `test_api_should_reject_same_team_as_winner_and_loser`           |
| MATCH-024 | completed_at未設定  | 承認前                                   | matches取得         | NULLである                         | Integration | `test_api_should_keep_completed_at_null_before_completion`       |
| MATCH-025 | 冪等性              | 同一approve再送                           | approve-match実行   | 結果が変化しない                        | Integration | `test_api_should_handle_duplicate_approve_requests_idempotently` |
| MATCH-026 | 監査ログ整合性          | 試合終了                                  | 監査ログ確認            | 操作履歴が記録される                      | Integration | `test_api_should_record_match_audit_log`                         |
| MATCH-027 | DB整合性            | 試合終了                                  | 関連テーブル確認          | matches・teams・rating_historyが一致 | Integration | `test_api_should_keep_match_related_tables_consistent`           |
| MATCH-028 | APIレスポンス         | 試合終了                                  | レスポンス確認           | 仕様どおりのDTO                       | Integration | `test_api_should_return_match_response_dto`                      |
| MATCH-029 | 状態遷移             | IN_PROGRESS→WINNER_REPORTED→COMPLETED | 状態確認              | 正しい順序で遷移                        | Integration | `test_api_should_follow_match_status_lifecycle`                  |
| MATCH-030 | ライフサイクル逸脱        | COMPLETEDから報告                         | report-match実行    | 状態遷移拒否                          | Integration | `test_api_should_reject_invalid_match_state_transition`          |

---

# 3. 境界値テスト

| 対象           | 境界値                                       |
| ------------ | ----------------------------------------- |
| Match Status | IN_PROGRESS / WINNER_REPORTED / COMPLETED |
| 承認回数         | 0 / 1 / 2                                 |
| 試合履歴件数       | 0 / 1 / 多数                                |

---

# 4. 異常系テスト

以下を必ず実施する。

* 存在しない試合ID
* 不正な状態遷移
* 権限のない報告・承認
* 二重報告
* 二重承認
* DB更新失敗
* Realtime送信失敗
* 同時承認競合

---

# 5. AI実装ルール

* `report-match` はレート更新を行わない。
* `approve-match` のみレート更新を実施する。
* `completed_at` は承認完了時のみ設定する。
* 状態遷移は `IN_PROGRESS → WINNER_REPORTED → COMPLETED` のみ許可する。
* 試合終了処理は単一トランザクションで実行する。
* 冪等性を保証し、再送による二重更新を防止する。
* Security Testでは勝者・敗者以外からの操作を拒否することを確認する。
