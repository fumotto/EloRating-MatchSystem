# 10_TestSpecification.md

## Part10

# End-to-End (E2E) Tests

---

# 1. 目的

本章では、システム全体を通したユーザーシナリオを検証する。

E2Eテストは以下を対象とする。

* 認証
* チーム管理
* マッチング
* 試合
* ランキング
* 管理機能

Playwrightを使用し、実際のブラウザ操作に近い形で検証する。

---

# 2. テストシナリオ

| ID      | シナリオ       | 前提条件       | 確認方法                        | 期待結果                   | 自動化 | テストメソッド名                                                 |
| ------- | ---------- | ---------- | --------------------------- | ---------------------- | --- | -------------------------------------------------------- |
| E2E-001 | 初回ログイン     | Steam認証可能  | ログイン操作                      | ホーム画面へ遷移し、プロフィールが作成される | E2E | `test_e2e_should_complete_first_login_flow`              |
| E2E-002 | チーム作成      | 未所属ユーザー    | チーム作成フォーム送信                 | チームが作成され、リーダーとして登録される  | E2E | `test_e2e_should_create_team`                            |
| E2E-003 | メンバー招待     | リーダー権限     | 招待コード発行・受諾                  | メンバーがチームへ参加する          | E2E | `test_e2e_should_invite_and_join_team`                   |
| E2E-004 | チーム脱退      | 一般メンバー     | 脱退操作                        | チームから脱退する              | E2E | `test_e2e_should_leave_team`                             |
| E2E-005 | マッチング開始    | 2チーム準備完了   | 双方がキュー登録                    | マッチング成立通知を受信する         | E2E | `test_e2e_should_match_two_teams`                        |
| E2E-006 | 試合結果登録     | 試合中        | 勝者が結果を報告する                  | 試合が勝者報告状態になる           | E2E | `test_e2e_should_report_match_result`                    |
| E2E-007 | 試合承認       | 勝者報告済み     | 敗者が承認する                     | 試合が完了し、レートが更新される       | E2E | `test_e2e_should_complete_match`                         |
| E2E-008 | ランキング更新    | 試合終了済み     | ランキング画面表示                   | 順位とレートが更新される           | E2E | `test_e2e_should_refresh_rankings_after_match`           |
| E2E-009 | 管理者BAN     | 管理者ログイン    | チームBAN実行                    | BANチームがマッチングできなくなる     | E2E | `test_e2e_should_ban_team`                               |
| E2E-010 | K値変更       | 管理者ログイン    | K値変更後に試合実施                  | 変更後K値でレート計算される         | E2E | `test_e2e_should_apply_updated_k_factor`                 |
| E2E-011 | レートリセット    | 管理者ログイン    | レートリセット実行                   | 全チームが初期レートへ戻る          | E2E | `test_e2e_should_reset_all_team_ratings`                 |
| E2E-012 | チーム人数上限変更  | 管理者ログイン    | 人数上限変更・招待                   | 新しい上限が適用される            | E2E | `test_e2e_should_apply_updated_team_member_limit`        |
| E2E-013 | 途中キャンセル    | 待機中        | 待機解除操作                      | マッチングキューから除外される        | E2E | `test_e2e_should_cancel_matchmaking_queue`               |
| E2E-014 | 不正アクセス     | 一般ユーザー     | 管理画面へアクセス                   | アクセス拒否される              | E2E | `test_e2e_should_reject_admin_access_for_normal_user`    |
| E2E-015 | 他チーム操作     | 一般ユーザー     | 他チーム編集試行                    | 権限エラーとなる               | E2E | `test_e2e_should_reject_other_team_operation`            |
| E2E-016 | 招待期限切れ     | 期限切れ招待     | 参加操作                        | 参加できない                 | E2E | `test_e2e_should_reject_expired_invite`                  |
| E2E-017 | 通信障害復帰     | API一時停止後復旧 | 画面操作                        | エラー表示後に再試行で成功する        | E2E | `test_e2e_should_recover_from_temporary_network_failure` |
| E2E-018 | ブラウザ再読み込み  | 試合中        | ページ再読み込み                    | 状態が正しく復元される            | E2E | `test_e2e_should_restore_match_state_after_reload`       |
| E2E-019 | Realtime通知 | 試合成立・試合終了  | 複数ブラウザ確認                    | 両ブラウザが同期される            | E2E | `test_e2e_should_sync_match_state_across_clients`        |
| E2E-020 | 主要フロー回帰テスト | 新規環境       | ログイン→チーム作成→マッチ→試合終了→ランキング確認 | 主要機能が一連で正常動作する         | E2E | `test_e2e_should_complete_full_application_flow`         |

---

# 3. テストデータ

E2Eテストでは以下のアカウントを使用する。

| アカウント    | 用途          |
| -------- | ----------- |
| PLAYER_A | Team A リーダー |
| PLAYER_B | Team A メンバー |
| PLAYER_C | Team B リーダー |
| PLAYER_D | Team B メンバー |
| ADMIN    | 管理者         |

Steam認証はテスト環境ではモック認証またはテスト用認証プロバイダーを利用する。

---

# 4. AI実装ルール

* Playwrightを使用し、ブラウザ操作をユーザー視点で実施する。
* セレクタは`data-testid`ではなく、可能な限りロール・ラベル・表示テキストを利用する。
* Realtimeを利用するシナリオは、必要に応じて複数ブラウザコンテキストで検証する。
* テストは互いに独立し、実行順に依存しないこと。
* 共通処理（ログイン・チーム作成など）はPlaywright Fixtureとして共通化する。
* 長時間待機を避け、イベント待機・状態待機を使用する。

---

# 5. 完了条件

以下を満たした場合、本システムのMVP品質基準を満たしたものとする。

* Unit Test：100%成功
* Integration Test：100%成功
* Security Test：100%成功
* Frontend Test：100%成功
* E2E Test：100%成功

重大・高優先度の未解決不具合が存在しないこと。
