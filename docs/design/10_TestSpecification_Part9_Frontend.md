# 10_TestSpecification_Part9_Frontend.md

# Test Specification — Part 9: フロントエンド

Version: 2.0
Status: Active
Last Updated: 2026-08-03

方針は `10_TestSpecification.md`（Part1）を参照する。

---

# 1. 対象

* React Components
* ViewModel Hook / Feature Hook
* ルーティングとガード（TanStack Router）
* フォームとバリデーション
* Backend Client
* Realtime連携
* エラー表示

Backend Client はモック化し、UIロジックを独立して検証する。

---

# 2. テストケース

## 2.1 認証UI

| ID        | 観点          | 前提条件   | 操作     | 期待結果                  | 種別       | テスト名                                            |
| --------- | ----------- | ------ | ------ | --------------------- | -------- | ----------------------------------------------- |
| TC-UI-001 | ログイン画面      | 未ログイン  | 画面表示   | ログインボタンが表示される         | Frontend | `renders the login page`                        |
| TC-UI-002 | ログイン成功      | 認証成功   | ログイン操作 | ダッシュボードへ遷移する          | Frontend | `navigates to the dashboard after login`        |
| TC-UI-003 | ログイン失敗      | 認証失敗   | ログイン操作 | エラーメッセージを表示する         | Frontend | `shows an error when login fails`               |
| TC-UI-004 | プロバイダ非依存の表示 | 認証済み   | 画面表示   | `authProvider` に応じた表示になる | Frontend | `renders the provider name from the profile`    |
| TC-UI-005 | ログアウト       | 認証済み   | ログアウト  | 公開画面へ戻り、購読が解除される      | Frontend | `unsubscribes from realtime on logout`          |

## 2.2 ルーティング

| ID        | 観点             | 前提条件   | 操作           | 期待結果                | 種別       | テスト名                                             |
| --------- | -------------- | ------ | ------------ | ------------------- | -------- | ------------------------------------------------ |
| TC-UI-006 | **未認証でのランキング** | 未ログイン  | `/ranking` へ遷移 | 表示できる（リダイレクトされない）   | Frontend | `serves the ranking route without authentication` |
| TC-UI-007 | 保護ルート          | 未ログイン  | `/dashboard` へ遷移 | `/login` へリダイレクトされる  | Frontend | `redirects an anonymous visitor to login`        |
| TC-UI-008 | 管理ルート          | 一般利用者  | `/admin` へ遷移  | 403画面が表示される         | Frontend | `shows a forbidden page for a non-admin`         |
| TC-UI-009 | 管理ルートの許可       | 管理者    | `/admin` へ遷移  | 表示できる               | Frontend | `renders the admin page for an administrator`    |
| TC-UI-010 | **404画面**      | －      | 未定義のURLへ遷移   | Not Found画面が表示される   | Frontend | `renders the not found page`                     |
| TC-UI-011 | マッチング画面        | 認証済み   | `/matchmaking` へ遷移 | 待機画面が表示される          | Frontend | `renders the matchmaking route`                  |
| TC-UI-012 | 直リンク           | 認証済み   | `/matches/:id` へ直接アクセス | 試合詳細が表示される          | Frontend | `resolves a deep link to the match detail`       |

TC-UI-006 と TC-UI-010 は、それぞれ ADR-018 と GitHub Pages のSPA配信（`11_Deployment.md`）に関わるため重要である。

## 2.3 チームUI

| ID        | 観点        | 前提条件      | 操作     | 期待結果             | 種別       | テスト名                                              |
| --------- | --------- | --------- | ------ | ---------------- | -------- | ------------------------------------------------- |
| TC-UI-013 | 未所属の空状態   | チーム未所属    | 画面表示   | 作成・参加への導線が表示される  | Frontend | `shows the empty state when not in a team`        |
| TC-UI-014 | チーム詳細     | チーム所属     | 画面表示   | メンバー一覧とレートが表示される | Frontend | `renders the team detail`                         |
| TC-UI-015 | 役割の表示     | LEADERが存在 | 画面表示   | LEADERが識別できる     | Frontend | `marks the team leader`                           |
| TC-UI-016 | チーム作成フォーム | 未所属       | フォーム送信 | 作成APIが呼ばれる       | Frontend | `submits the create team form`                    |
| TC-UI-017 | 必須検証      | 空入力       | 送信     | バリデーションエラーを表示する  | Frontend | `validates that the team name is required`        |
| TC-UI-018 | 文字数検証     | 31文字      | 送信     | バリデーションエラーを表示する  | Frontend | `validates the team name length`                  |
| TC-UI-019 | 招待コード表示   | LEADER    | 招待発行   | コードがダイアログに表示される  | Frontend | `shows the generated invite code`                 |
| TC-UI-020 | 招待受諾      | 有効な招待     | コード入力  | 参加完了が表示される       | Frontend | `accepts an invite code`                          |
| TC-UI-021 | 脱退確認      | 所属中       | 脱退ボタン  | 確認ダイアログが表示される    | Frontend | `asks for confirmation before leaving`            |
| TC-UI-022 | LEADER操作の非表示 | MEMBER    | 画面表示   | 招待発行・移譲のボタンが表示されない | Frontend | `hides leader-only actions from members`          |

## 2.4 マッチングUI

| ID        | 観点         | 前提条件      | 操作     | 期待結果               | 種別       | テスト名                                             |
| --------- | ---------- | --------- | ------ | ------------------ | -------- | ------------------------------------------------ |
| TC-UI-023 | 待機開始       | 未待機・LEADER | ボタン押下  | 待機状態の表示に変わる        | Frontend | `starts matchmaking`                             |
| TC-UI-024 | 待機中の表示     | 待機中       | 画面確認   | 待機中であることが表示される     | Frontend | `shows the queued state`                         |
| TC-UI-025 | **相手なしの表示** | 相手が見つからない | 応答受信   | エラーではなく待機中として表示される | Frontend | `treats no opponent as a normal waiting state`   |
| TC-UI-026 | 待機解除       | 待機中       | ボタン押下  | 待機が解除される           | Frontend | `cancels matchmaking`                            |
| TC-UI-027 | MEMBERの制限  | MEMBER    | 画面表示   | 待機開始ボタンが操作できない     | Frontend | `disables the queue button for members`          |
| TC-UI-028 | 成立の反映      | マッチ成立通知受信 | 通知受信   | 試合画面へ遷移する          | Frontend | `navigates to the match on MATCH_CREATED`        |

## 2.5 試合UI

| ID        | 観点              | 前提条件              | 操作    | 期待結果                    | 種別       | テスト名                                                  |
| --------- | --------------- | ----------------- | ----- | ----------------------- | -------- | ----------------------------------------------------- |
| TC-UI-029 | 試合画面            | `PLAYING`         | 画面表示  | 両チームと申告ボタンが表示される        | Frontend | `renders the match page`                              |
| TC-UI-030 | **申告期限の表示**     | `PLAYING`         | 画面確認  | 申告期限までの残り時間が表示される       | Frontend | `shows the remaining time until the report deadline`  |
| TC-UI-031 | 勝利申告            | `PLAYING`・勝者チーム   | 送信    | 成功メッセージが表示される           | Frontend | `submits the match report`                            |
| TC-UI-032 | 申告ボタンの制御        | 敗者チーム             | 画面表示  | 申告ボタンが表示されない            | Frontend | `hides the report action from the losing side`        |
| TC-UI-033 | **承認期限の表示**     | `WINNER_REPORTED` | 画面確認  | 承認期限までの残り時間が表示される       | Frontend | `shows the remaining time until the approval deadline` |
| TC-UI-034 | 承認              | `WINNER_REPORTED`・敗者チーム | 送信    | 試合完了が表示される              | Frontend | `submits the approval`                                |
| TC-UI-035 | **拒否**          | `WINNER_REPORTED`・敗者チーム | 送信    | 進行中へ戻ったことが表示される         | Frontend | `submits the rejection`                               |
| TC-UI-036 | **拒否の残り回数**     | `WINNER_REPORTED` | 画面確認  | 残り拒否回数が表示される            | Frontend | `shows the remaining reject count`                    |
| TC-UI-037 | 拒否の確認           | 拒否ボタン押下           | 操作    | 確認ダイアログが表示される           | Frontend | `asks for confirmation before rejecting`              |
| TC-UI-038 | **DRAWNの表示**    | `DRAWN`           | 画面表示  | 引き分け解散した旨が表示される         | Frontend | `renders a drawn match`                               |
| TC-UI-039 | 自動承認の表示         | `auto_approved` が true | 画面表示  | 自動承認により確定した旨が表示される      | Frontend | `indicates that the match was auto-approved`          |
| TC-UI-040 | **versionの送信**  | 更新操作              | 送信    | Match Detail の `version` が送信される | Frontend | `sends the version with mutating requests`            |
| TC-UI-041 | **競合時の再取得**     | `MATCH-008` を受信   | 応答受信  | 詳細を再取得し、自動再送しない         | Frontend | `refetches instead of retrying on a version conflict` |
| TC-UI-042 | 重複送信の防止         | 送信中               | ボタン確認 | ボタンが無効化される              | Frontend | `disables the submit button while pending`            |
| TC-UI-043 | Realtime反映      | イベント受信            | 通知受信  | 画面が更新される                | Frontend | `updates the view on a realtime event`                |

## 2.6 ランキングUI

| ID        | 観点        | 前提条件      | 操作    | 期待結果            | 種別       | テスト名                                             |
| --------- | --------- | --------- | ----- | --------------- | -------- | ------------------------------------------------ |
| TC-UI-044 | 一覧表示      | データあり     | 画面表示  | 順位・レート・戦績が表示される | Frontend | `renders the ranking table`                      |
| TC-UI-045 | 空状態       | データなし     | 画面表示  | 空状態が表示される       | Frontend | `renders the empty ranking state`                |
| TC-UI-046 | **勝率なしの表示** | 試合数0のチーム  | 画面表示  | `-` 等で表示され、NaNにならない | Frontend | `renders a placeholder when the win rate is null` |
| TC-UI-047 | 同率順位の表示   | 同一レートのチーム | 画面表示  | 同じ順位が表示される      | Frontend | `renders equal ranks for tied teams`             |
| TC-UI-048 | ページング     | 多数のチーム    | ページ切替 | 次ページが表示される      | Frontend | `paginates the ranking`                          |
| TC-UI-049 | 更新の反映     | 通知受信      | 通知受信  | 先頭ページから再取得される   | Frontend | `refetches the ranking from the first page`      |

## 2.7 管理UI

| ID        | 観点       | 前提条件  | 操作     | 期待結果            | 種別       | テスト名                                           |
| --------- | -------- | ----- | ------ | --------------- | -------- | ---------------------------------------------- |
| TC-UI-050 | チーム管理    | 管理者   | 画面表示   | チーム一覧とBAN操作が表示される | Frontend | `renders the team management page`             |
| TC-UI-051 | BAN確認    | 管理者   | BANボタン | 理由入力つき確認ダイアログが表示される | Frontend | `asks for a reason before banning`             |
| TC-UI-052 | 設定フォーム   | 管理者   | 画面表示   | 現在の設定値が初期表示される  | Frontend | `prefills the settings form`                   |
| TC-UI-053 | 設定の範囲検証  | K=129 | 送信     | バリデーションエラーを表示する | Frontend | `validates the setting ranges on the client`   |
| TC-UI-054 | リセット確認   | 管理者   | リセット操作 | 影響範囲を示す確認ダイアログが表示される | Frontend | `warns about the impact before resetting`      |
| TC-UI-055 | 監査ログ表示   | 管理者   | 画面表示   | 監査ログ一覧が表示される    | Frontend | `renders the audit log`                        |

## 2.8 エラー処理

| ID        | 観点             | 前提条件                | 操作         | 期待結果                    | 種別       | テスト名                                                |
| --------- | -------------- | ------------------- | ---------- | ----------------------- | -------- | --------------------------------------------------- |
| TC-UI-056 | 業務エラー          | 409応答               | 操作実行       | Toastが表示される             | Frontend | `shows a toast for a business error`                |
| TC-UI-057 | **コードからの文言生成** | `TEAM-004` を受信      | 応答受信       | 共通モジュールが生成した日本語文言が表示される | Frontend | `maps the error code to a localized message`        |
| TC-UI-058 | **生メッセージの非表示** | `error.message` が英語 | 応答受信       | バックエンドの英文が直接表示されない      | Frontend | `never renders the raw backend message`             |
| TC-UI-059 | 未知のコード         | 未定義のコード             | 応答受信       | 汎用メッセージが表示される           | Frontend | `falls back to a generic message for unknown codes` |
| TC-UI-060 | バリデーションエラー     | 400応答               | フォーム送信     | フォーム下部に表示される            | Frontend | `shows validation errors under the field`           |
| TC-UI-061 | ネットワークエラー      | 通信失敗                | 操作実行       | 再試行導線つきのAlertが表示される     | Frontend | `shows a retry alert on a network error`            |
| TC-UI-062 | システムエラー        | 500応答               | 操作実行       | エラーページが表示される            | Frontend | `renders the error page on a server error`          |
| TC-UI-063 | リトライ対象         | ネットワークエラー           | 操作実行       | 3回まで再試行される              | Frontend | `retries network errors up to three times`          |
| TC-UI-064 | リトライ非対象        | 409応答               | 操作実行       | 再試行されない                 | Frontend | `does not retry business errors`                    |

## 2.9 状態管理

| ID        | 観点              | 前提条件      | 操作      | 期待結果                    | 種別       | テスト名                                                |
| --------- | --------------- | --------- | ------- | ----------------------- | -------- | --------------------------------------------------- |
| TC-UI-065 | サーバーデータの管理      | 各画面       | 状態確認    | TanStack Query が保持する    | Frontend | `keeps server data in the query cache`              |
| TC-UI-066 | **Zustandの用途**  | 各画面       | ストア確認   | サーバーデータを保持していない         | Frontend | `never stores server data in the zustand store`     |
| TC-UI-067 | Realtimeでの再取得   | イベント受信    | 通知受信    | Query が invalidate される  | Frontend | `invalidates queries on a realtime event`           |
| TC-UI-068 | **キャッシュの直接更新禁止** | イベント受信    | 通知受信    | 受信データでキャッシュを書き換えない      | Frontend | `refetches instead of patching the cache`           |
| TC-UI-069 | Mutation後の無効化   | 更新成功      | 操作実行    | 関連する Query のみ無効化される     | Frontend | `invalidates only the affected queries`             |
| TC-UI-070 | ログアウト時の破棄       | ログアウト     | 操作実行    | プロフィールのキャッシュが破棄される      | Frontend | `clears the profile cache on logout`                |

## 2.10 表示品質

| ID        | 観点        | 前提条件    | 操作   | 期待結果             | 種別       | テスト名                                          |
| --------- | --------- | ------- | ---- | ---------------- | -------- | --------------------------------------------- |
| TC-UI-071 | ローディング    | 取得中     | 画面確認 | ローディング表示がされる     | Frontend | `shows a loading indicator while fetching`    |
| TC-UI-072 | ダークモード    | テーマ切替   | 操作実行 | 配色が切り替わる         | Frontend | `switches between light and dark themes`      |
| TC-UI-073 | キーボード操作   | フォーム    | Tab操作 | すべての操作要素へ到達できる   | Frontend | `supports keyboard navigation`                |
| TC-UI-074 | ラベルとロール   | 各画面     | 画面確認 | 適切なロールとラベルを持つ    | Frontend | `exposes accessible roles and labels`         |
| TC-UI-075 | アイコンの補足   | アイコンボタン | 画面確認 | ラベルまたは代替テキストを持つ  | Frontend | `labels icon-only controls`                   |

---

# 3. 作成してはならないテスト

| 対象                        | 理由                                       |
| ------------------------- | ---------------------------------------- |
| React Router のAPIに依存したテスト | TanStack Router を採用（ADR-006）              |
| 再レンダリング回数の測定              | 実装の内部構造に依存し壊れやすい。パフォーマンス改善は計測ツールで別途行う    |
| チーム一覧からのチーム削除操作           | チーム削除はMVP対象外                             |

---

# 4. AI実装ルール

* Component Test は React Testing Library を使用する。
* ユーザー操作は `userEvent` を使用し、DOMを直接操作しない。
* Backend Client はモック化する。
* Realtime イベントはモックイベントで検証する。
* フォーム入力・バリデーション・画面遷移・エラー表示を必ずテストする。
* エラーコードから表示文言への変換が共通モジュール経由であることを検証する。
* Zustand にサーバーデータが入らないことを検証する。
* 更新系操作で `version` が送信されることを検証する。
* アクセシビリティ（ロール・ラベル・キーボード操作）を確認する。
