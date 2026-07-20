# 10_TestSpecification.md

## Part9

# Frontend Tests

---

# 1. 対象

本章ではフロントエンド(UI)に関するテストケースを定義する。

対象

* React Components
* Custom Hooks
* Routing
* Forms
* API Client
* Realtime
* Error Handling

---

# 2. テストケース

## 2.1 Authentication UI

| ID     | 観点       | 前提条件  | 確認方法  | 期待結果          | 自動化      | テストメソッド名                              |
| ------ | -------- | ----- | ----- | ------------- | -------- | ------------------------------------- |
| UI-001 | ログイン画面表示 | 未ログイン | 画面表示  | ログインボタンが表示される | Frontend | `test_ui_should_render_login_page`    |
| UI-002 | ログイン成功   | 認証成功  | 画面遷移  | ホーム画面へ遷移する    | Frontend | `test_ui_should_navigate_after_login` |
| UI-003 | ログイン失敗   | 認証失敗  | エラー表示 | エラーメッセージを表示する | Frontend | `test_ui_should_display_login_error`  |

---

## 2.2 Team UI

| ID     | 観点        | 前提条件  | 確認方法   | 期待結果       | 自動化      | テストメソッド名                                      |
| ------ | --------- | ----- | ------ | ---------- | -------- | --------------------------------------------- |
| UI-004 | チーム一覧表示   | チーム存在 | 画面表示   | 一覧表示される    | Frontend | `test_ui_should_render_team_list`             |
| UI-005 | チーム作成フォーム | 未所属   | フォーム送信 | 作成APIが呼ばれる | Frontend | `test_ui_should_submit_create_team_form`      |
| UI-006 | チーム名必須    | 空入力   | 送信     | バリデーションエラー | Frontend | `test_ui_should_validate_required_team_name`  |
| UI-007 | 招待一覧表示    | 招待あり  | 画面表示   | 一覧表示される    | Frontend | `test_ui_should_render_team_invites`          |
| UI-008 | 招待受諾      | 有効招待  | ボタン押下  | 参加完了表示     | Frontend | `test_ui_should_accept_team_invite`           |
| UI-009 | 脱退確認      | 所属中   | 脱退ボタン  | 確認ダイアログ表示  | Frontend | `test_ui_should_show_leave_team_confirmation` |

---

## 2.3 Queue UI

| ID     | 観点    | 前提条件      | 確認方法  | 期待結果     | 自動化      | テストメソッド名                                  |
| ------ | ----- | --------- | ----- | -------- | -------- | ----------------------------------------- |
| UI-010 | 待機開始  | ACTIVEチーム | ボタン押下 | 待機状態になる  | Frontend | `test_ui_should_start_matchmaking_queue`  |
| UI-011 | 待機解除  | 待機中       | ボタン押下 | 待機解除される  | Frontend | `test_ui_should_cancel_matchmaking_queue` |
| UI-012 | 待機中表示 | 待機中       | 画面確認  | ローディング表示 | Frontend | `test_ui_should_display_queue_status`     |

---

## 2.4 Match UI

| ID     | 観点         | 前提条件   | 確認方法  | 期待結果      | 自動化      | テストメソッド名                                              |
| ------ | ---------- | ------ | ----- | --------- | -------- | ----------------------------------------------------- |
| UI-013 | 試合画面表示     | 試合中    | 画面表示  | 試合情報表示    | Frontend | `test_ui_should_render_match_page`                    |
| UI-014 | 勝者報告       | 試合中    | 送信    | 成功メッセージ表示 | Frontend | `test_ui_should_submit_match_report`                  |
| UI-015 | 敗者承認       | 勝者報告済み | 送信    | 試合終了表示    | Frontend | `test_ui_should_submit_match_approval`                |
| UI-016 | Realtime通知 | 試合成立   | 通知受信  | 画面更新      | Frontend | `test_ui_should_update_on_realtime_match_event`       |
| UI-017 | 重複送信防止     | 送信中    | ボタン確認 | ボタン無効化    | Frontend | `test_ui_should_disable_submit_button_during_request` |

---

## 2.5 Ranking UI

| ID     | 観点      | 前提条件  | 確認方法 | 期待結果    | 自動化      | テストメソッド名                               |
| ------ | ------- | ----- | ---- | ------- | -------- | -------------------------------------- |
| UI-018 | ランキング表示 | データあり | 画面表示 | ランキング表示 | Frontend | `test_ui_should_render_rankings`       |
| UI-019 | 空ランキング  | データなし | 画面表示 | 空状態表示   | Frontend | `test_ui_should_render_empty_rankings` |

---

## 2.6 Error Handling

| ID     | 観点         | 前提条件     | 確認方法       | 期待結果          | 自動化      | テストメソッド名                                     |
| ------ | ---------- | -------- | ---------- | ------------- | -------- | -------------------------------------------- |
| UI-020 | APIエラー     | 500応答    | 画面確認       | エラーメッセージ表示    | Frontend | `test_ui_should_display_api_error`           |
| UI-021 | ネットワーク切断   | 通信失敗     | 画面確認       | リトライ案内表示      | Frontend | `test_ui_should_display_network_error`       |
| UI-022 | 404画面      | 存在しないURL | 画面遷移       | Not Found画面表示 | Frontend | `test_ui_should_render_not_found_page`       |
| UI-023 | ローディング表示   | API実行中   | 画面確認       | ローディング表示      | Frontend | `test_ui_should_display_loading_indicator`   |
| UI-024 | 再レンダリング最適化 | 状態更新なし   | レンダリング回数測定 | 不要な再描画が発生しない  | Frontend | `test_ui_should_avoid_unnecessary_rerenders` |

---

# 3. AI実装ルール

* Component TestはReact Testing Libraryを使用する。
* ユーザー操作は`userEvent`を使用し、DOM操作を直接行わない。
* APIはモック化し、UIロジックを独立して検証する。
* Realtimeイベントはモックイベントで検証する。
* フォーム入力・バリデーション・画面遷移・エラー表示を必ずテストする。
* レンダリング結果だけでなく、アクセシビリティ（ラベル・ロール・キーボード操作）も確認する。
