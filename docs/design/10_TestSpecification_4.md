# 10_TestSpecification.md

## Part4

# Matchmaking Tests

---

# 1. 対象

本章ではマッチングキューおよびマッチ成立処理に関するテストケースを定義する。

対象

* queue-match
* cancel-queue
* matchmaking
* match_queue
* Realtime通知
* 同時実行制御

---

# 2. テストケース

| ID        | 観点         | 前提条件        | 確認方法           | 期待結果              | 自動化         | テストメソッド名                                                 |
| --------- | ---------- | ----------- | -------------- | ----------------- | ----------- | -------------------------------------------------------- |
| QUEUE-001 | キュー登録      | ACTIVEチーム   | queue-match実行  | 待機キューへ登録される       | Integration | `test_api_should_enqueue_team`                           |
| QUEUE-002 | 二重登録防止     | 待機中         | queue-match実行  | 重複登録されない          | Integration | `test_api_should_reject_duplicate_queue`                 |
| QUEUE-003 | キュー解除      | 待機中         | cancel-queue実行 | 待機キューから削除される      | Integration | `test_api_should_cancel_queue`                           |
| QUEUE-004 | 未登録解除      | 待機していない     | cancel-queue実行 | エラーを返す            | Integration | `test_api_should_reject_cancel_when_not_queued`          |
| QUEUE-005 | レート差400以内  | 差400以内      | queue-match実行  | マッチ成立             | Integration | `test_api_should_match_within_rating_gap`                |
| QUEUE-006 | レート差401以上  | 差401以上      | queue-match実行  | マッチしない            | Integration | `test_api_should_not_match_outside_rating_gap`           |
| QUEUE-007 | 最小レート差優先   | 候補が複数存在     | マッチング実行        | 最小差の相手を選択         | Integration | `test_api_should_select_closest_rating_team`             |
| QUEUE-008 | 待機時間優先     | レート差同一      | マッチング実行        | 待機時間が長い相手を選択      | Integration | `test_api_should_prioritize_oldest_queue`                |
| QUEUE-009 | Team ID優先  | レート差・待機時間同一 | マッチング実行        | Team ID昇順を選択      | Integration | `test_api_should_break_tie_by_team_id`                   |
| QUEUE-010 | マッチ生成      | 成立条件を満たす    | DB確認           | matchesが作成される     | Integration | `test_api_should_create_match_record`                    |
| QUEUE-011 | キュー削除      | マッチ成立       | DB確認           | 両チームが待機キューから削除される | Integration | `test_api_should_remove_teams_from_queue_after_match`    |
| QUEUE-012 | 試合状態更新     | マッチ成立       | teams確認        | 両チームが試合中状態になる     | Integration | `test_api_should_mark_teams_as_in_match`                 |
| QUEUE-013 | Realtime通知 | マッチ成立       | 通知確認           | MATCH_FOUNDが送信される | Integration | `test_api_should_publish_match_found_event`              |
| QUEUE-014 | BANチーム     | BAN状態       | queue-match実行  | 登録拒否              | Integration | `test_api_should_reject_banned_team_queue`               |
| QUEUE-015 | 試合中チーム     | 進行中試合あり     | queue-match実行  | 登録拒否              | Integration | `test_api_should_reject_team_already_in_match`           |
| QUEUE-016 | 無効チーム      | ACTIVE以外    | queue-match実行  | 登録拒否              | Integration | `test_api_should_reject_inactive_team_queue`             |
| QUEUE-017 | 同時登録       | 複数チーム同時登録   | マッチング実行        | 重複マッチなし           | Integration | `test_api_should_handle_concurrent_queue_requests`       |
| QUEUE-018 | 二重マッチ防止    | 同時実行        | DB確認           | 1試合のみ生成される        | Integration | `test_api_should_prevent_duplicate_match_creation`       |
| QUEUE-019 | ロールバック     | マッチ生成失敗     | DB確認           | キュー状態が維持される       | Integration | `test_api_should_rollback_match_creation_transaction`    |
| QUEUE-020 | 待機継続       | 相手なし        | DB確認           | 待機状態を維持する         | Integration | `test_api_should_keep_team_in_queue_when_no_match_found` |
| QUEUE-021 | 大量待機       | 多数チーム待機     | マッチング実行        | 全チームが適切に処理される     | Integration | `test_api_should_process_multiple_queued_teams`          |
| QUEUE-022 | キャンセル直後    | 待機解除直後      | マッチング実行        | マッチ対象外となる         | Integration | `test_api_should_exclude_recently_cancelled_team`        |
| QUEUE-023 | 境界値400     | 差400ちょうど    | マッチング実行        | マッチ成立             | Unit        | `test_should_match_on_rating_gap_boundary`               |
| QUEUE-024 | 境界値401     | 差401        | マッチング実行        | 成立しない             | Unit        | `test_should_reject_match_above_rating_gap_boundary`     |
| QUEUE-025 | イベント駆動     | 新規キュー登録     | 処理確認           | 登録イベントでマッチング開始    | Integration | `test_api_should_trigger_matchmaking_on_queue_event`     |

---

# 3. 境界値テスト

| 対象     | 境界値             |
| ------ | --------------- |
| レート差   | 399 / 400 / 401 |
| 待機チーム数 | 0 / 1 / 2 / 多数  |
| 同時登録数  | 2 / 10 / 100    |

---

# 4. 異常系テスト

以下を必ず実施する。

* 存在しないチームでキュー登録
* 重複キュー登録
* BANチームの登録
* 試合中チームの登録
* キャンセル対象なし
* マッチ生成中のDBエラー
* Realtime通知失敗時のロールバック有無
* 同時実行による競合

---

# 5. AI実装ルール

* マッチングはイベント駆動で実装する。
* レート差・待機時間・Team IDの優先順位を厳守する。
* マッチ成立処理は単一トランザクションで実行する。
* 同時実行時に二重マッチが発生しないことを保証する。
* Realtime通知はマッチ成立後に送信する。
* Integration TestではDB状態とRealtime通知の両方を検証する。
