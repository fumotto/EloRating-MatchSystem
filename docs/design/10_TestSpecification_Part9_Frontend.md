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
| TC-UI-035 | **投了**          | `PLAYING`・敗者チーム       | 送信    | 確定が表示される                | Frontend | `submits the concession`                              |
| TC-UI-036 | **残り延長回数**      | `PLAYING`         | 画面確認  | 残り延長回数が表示される            | Frontend | `shows the remaining extensions`                      |
| TC-UI-037 | **投了の確認**       | 投了ボタン押下           | 操作    | 確認ダイアログが表示され、APIは呼ばれない   | Frontend | `asks for confirmation before conceding`              |
| TC-UI-038 | **DRAWNの理由別表示** | `DRAWN`（全種）      | 画面表示  | 理由ごとに異なる説明が表示される        | Frontend | `renders a distinct explanation per no-contest reason` |
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

## 2.11 実装済みのComponent Test

101番台は実装に合わせて追加したものである。上表（001〜075）は設計時に洗い出した観点であり、
番号を詰めて割り当て直すと既存の参照が壊れるため、続きの番号を使う。

| ID         | 観点            | 前提条件    | 操作   | 期待結果                     | 種別       | テスト名                                              |
| ---------- | ------------- | ------- | ---- | ------------------------ | -------- | ------------------------------------------------- |
| TC-UI-101  | エラー文言の変換      | 既知のコード  | 変換実行 | 対応する日本語文言を返す             | Frontend | `errorMessage`                                    |
| TC-UI-102  | 未知コードの既定文言    | 未知のコード  | 変換実行 | 既定の文言を返す                 | Frontend | `errorMessage`                                    |
| TC-UI-103  | コードの露出禁止      | 任意のコード  | 変換実行 | コード文字列をそのまま表示しない         | Frontend | `errorMessage`                                    |
| TC-UI-104  | ランキングの行       | 取得済み    | 画面確認 | チームごとに1行を表示する            | Frontend | `renders a row for each team`                     |
| TC-UI-105  | ランキングの空表示     | 0件      | 画面確認 | 空状態の案内を表示する              | Frontend | `renders an empty state`                          |
| TC-UI-106  | 勝率の未算出        | 試合数0    | 画面確認 | 勝率を `—` と表示する            | Frontend | `shows a dash when the win rate is unavailable`   |
| TC-UI-107  | **未認証への非表示**  | 未認証     | 画面確認 | チーム名をリンクにしない             | Frontend | `does not link team names for signed-out visitors` |
| TC-UI-108  | **メンバーへの導線**  | 認証済み    | 画面確認 | チーム名が `/team/:teamId` を指す | Frontend | `links team names to the member list when signed in` |
| TC-UI-109  | アイコンの表示       | CDNのURL  | 画面確認 | 画像を表示する                  | Frontend | `renders the image for a provider CDN url`        |
| TC-UI-110  | **参照元の秘匿**     | CDNのURL  | 画面確認 | `referrerpolicy=no-referrer` を付ける | Frontend | `does not leak the page url to the image host` |
| TC-UI-111  | アイコン未設定       | URLなし    | 画面確認 | 表示名の頭文字を出す               | Frontend | `falls back to the initial when there is no image` |
| TC-UI-112  | **許可外の配信元**    | 任意のホスト  | 画面確認 | 画像を読み込まない                | Frontend | `refuses a url outside the allowlist`             |
| TC-UI-113  | 前方一致の偽装       | `cdn.discordapp.com.evil` | 画面確認 | 画像を読み込まない | Frontend | `refuses a host that merely starts with the allowed name` |
| TC-UI-114  | 資格情報の埋め込み     | `user@host` 形式 | 画面確認 | 画像を読み込まない          | Frontend | `refuses credentials embedded in the url`         |
| TC-UI-115  | 非https           | `http://`  | 画面確認 | 画像を読み込まない                | Frontend | `refuses a non-https url`                         |

---

## 2.1 勝敗確定と通報の画面（ADR-032 / ADR-033 / ADR-034）

| ID         | 観点                       | 操作                             | 期待結果                                | 種別   | テスト名                                                    |
| ---------- | ------------------------ | ------------------------------ | ----------------------------------- | ---- | ------------------------------------------------------- |
| TC-UI-201  | **投了の二段階確認**             | 投了ボタンを押す                       | 確認ダイアログが開く。**この時点でAPIを呼ばない**       | Unit | `does not call the API until the concession is confirmed` |
| TC-UI-202  | **相手チーム名の明示**            | 確認ダイアログを開く                     | 相手チーム名が本文に含まれる                      | Unit | `names the opponent in the concession dialog`           |
| TC-UI-203  | **取り消せない旨の表示**           | 確認ダイアログを開く                     | 「取り消せません」の文言がある                     | Unit | `warns that a concession cannot be undone`              |
| TC-UI-204  | **確認の省略が無い**             | ダイアログを検査                       | 「次回から表示しない」に相当する要素が存在しない            | Unit | `offers no way to skip the confirmation`                |
| TC-UI-205  | キャンセル                    | ［やめる］を押す                       | APIが呼ばれない                           | Unit | `aborts the concession on cancel`                       |
| TC-UI-206  | 投了と承認の出し分け               | `WINNER_REPORTED`（相手が申告）で表示    | 承認と反対申告が出て、投了ボタンは重複しない              | Unit | `shows approve and counter-claim, not a duplicate concede` |
| TC-UI-207  | 自チーム申告時の表示               | `WINNER_REPORTED`（自チームが申告）     | 操作ボタンを出さず、取り消せない旨のみ表示               | Unit | `offers no actions to the reporting team`               |
| TC-UI-208  | **競合中の表示**               | `counter_claim_team_id` あり     | 「自動承認されない」旨と投了での決着が示される             | Unit | `explains that a contested match will not auto-approve` |
| TC-UI-209  | **DRAWN の理由別表示**         | すべての `no_contest_reason`      | それぞれ異なる説明が出る（一律の「引き分け」にしない）         | Unit | `renders a distinct explanation per no-contest reason`  |
| TC-UI-210  | **MUTUAL は不利益なしと表示**     | `MUTUAL`                       | 記録に影響しない旨が示される                      | Unit | `states that a mutual no-contest has no penalty`        |
| TC-UI-211  | **自動承認の明示**              | `auto_approved = true`         | 自動承認である旨が表示される                      | Unit | `marks an auto-approved match as such`                  |
| TC-UI-212  | クールダウンの表示                | `QUEUE-006`                    | 残り時間が出る。「ペナルティ」の語を使わない              | Unit | `shows the remaining cooldown without punitive wording` |
| TC-UI-213  | 最短の道の併記                  | クールダウン表示時                      | 投了・承認にクールダウンが無い旨が併記される              | Unit | `points out that settling honestly has no cooldown`     |
| TC-UI-214  | 延長の残り回数                  | `PLAYING`                      | 残り延長回数が表示される                        | Unit | `shows the remaining extensions`                        |
| TC-UI-215  | 通報フォームの必須                | 自由記述が空                         | 送信できない                              | Unit | `requires a detail in the report form`                  |
| TC-UI-216  | 残り文字数                    | 自由記述に入力                        | 残り文字数が更新される                         | Unit | `shows the remaining character count`                   |
| TC-UI-217  | **証拠なしで送信できる**           | 証拠URLを空で送信                     | 送信できる                               | Unit | `submits a report without evidence`                     |
| TC-UI-218  | **証拠は任意である旨の表示**         | フォームを開く                        | 「証拠が無くても通報できます」が表示される               | Unit | `tells the user that evidence is optional`              |
| TC-UI-219  | **送信後の文言**               | 送信完了                           | 「調査します」「対応します」を含まない                 | Unit | `does not promise an investigation after submitting`    |
| TC-UI-220  | **証拠URLを自動リンクしない**       | 通報詳細を表示                        | `<a href>` にならず、明示の操作で開く            | Unit | `renders evidence urls as text, not as links`           |
| TC-UI-221  | **管理画面は m を先に表示**        | 累積を表示                          | 通報元チーム数が通報件数より先に現れる                 | Unit | `shows the reporter team count before the report count` |
| TC-UI-222  | **訂正の導線が無い**             | 管理画面の通報詳細                      | 結果を訂正する操作が存在しない                     | Unit | `offers no way to correct a settled result`             |
| TC-UI-230  | 設定一覧の網羅                  | システム設定の一覧                      | ADR-032〜036 で追加した設定が表示される            | Unit | `shows the settings added for the report flow`          |
| TC-UI-231  | **廃止した設定の非表示**           | システム設定の一覧                      | 「拒否の上限回数」が存在しない                     | Unit | `never lists the retired reject limit`                  |
| TC-UI-232  | **シーズン状態の非表示**           | システム設定の一覧                      | マッチング停止・現在シーズンが存在しない                | Unit | `never lists the season state columns`                  |
| TC-UI-233  | **0 は「無効」と表示**           | `rematch_cooldown_hours = 0`     | 「無効」と表示され「0時間」にならない                 | Unit | `reads zero as disabled for the sub-account guard`      |
| TC-UI-234  | 0 を無効としない設定              | `max_report_extensions = 0`      | 「0回」と数値のまま表示される                     | Unit | `keeps a real zero-capable setting numeric when it is not a switch` |
| TC-UI-235  | **入力欄の網羅**               | 管理画面のシステム設定                    | ADR-032〜034 で追加した9項目に入力欄がある          | Unit | `offers an input for every wired setting`               |
| TC-UI-236  | **廃止した設定の入力欄が無い**        | 管理画面のシステム設定                    | 「拒否の上限回数」の入力欄が存在しない                 | Unit | `never offers the retired reject limit`                 |
| TC-UI-237  | 保守停止を立てる                 | 稼働中                            | `{ maintenancePaused: true }` を送る       | Unit | `turns the maintenance pause on`                        |
| TC-UI-238  | **保守停止を解除する**            | 停止中                            | `{ maintenancePaused: false }` を送る      | Unit | `turns the maintenance pause off`                       |
| TC-UI-239  | **手順の明示**                | 管理画面のシステム設定                    | 停止を先に立てる旨が表示される                     | Unit | `states that the pause comes before voiding matches`    |
| TC-UI-240  | 入力のあった項目のみ送信             | 1項目だけ入力                        | その項目だけが送られる                         | Unit | `sends only the numeric fields that were filled in`     |
| TC-UI-241  | **打ち切りと無効化の言い分け**        | `SEASON_END`                   | `ADMIN_VOID` と異なる文言で「シーズンの終了」を示す     | Unit | `distinguishes a season cutoff from an administrative void` |
| TC-UI-242  | 停止していなければ押せる             | 両方の停止が FALSE                   | 開始ボタンが有効                            | Unit | `lets a complete team queue while nothing is paused`    |
| TC-UI-243  | シーズン停止の案内               | `matchmaking_paused`           | 押す前に理由が出て、ボタンが無効                    | Unit | `explains the season pause before the button is pressed` |
| TC-UI-244  | **保守停止の案内**              | `maintenance_paused`           | 押す前に理由が出て、ボタンが無効                    | Unit | `explains the maintenance pause before the button is pressed` |
| TC-UI-245  | 両方立っているときの優先            | 両方 TRUE                        | 保守を先に伝える                            | Unit | `names maintenance first when both pauses are on`       |
| TC-UI-246  | シーズン画面：受付中              | 両方 FALSE                       | 「受付中」と表示                            | Unit | `reports matchmaking as open when nothing is paused`    |
| TC-UI-247  | シーズン画面：シーズン停止           | `matchmaking_paused`           | 「停止中（シーズン）」と表示                      | Unit | `reports the season pause`                              |
| TC-UI-248  | **シーズン画面：保守停止**          | `maintenance_paused` のみ        | 「受付中」と表示しない                         | Unit | `never reports matchmaking as open while maintenance is on` |
| TC-UI-249  | シーズン画面：両方               | 両方 TRUE                        | 原因を両方併記                             | Unit | `names both causes when both pauses are on`             |
| TC-UI-250  | **再開前の警告**               | 確定済み ＋ 保守停止                    | 解除するまで成立しない旨が出る                     | Unit | `warns before resuming that maintenance will keep matchmaking down` |
| TC-UI-251  | 不要な警告を出さない              | 確定済み ＋ 保守停止なし                  | 警告が出ない                              | Unit | `stays quiet about maintenance when it is not on`       |
| TC-UI-260  | BANチームを選ばせない            | BANチームが存在                       | 選択肢に現れない                            | Unit | `never offers a banned team`                            |
| TC-UI-261  | **無人チームを選ばせない**          | メンバー0人のチームが存在                   | 選択肢に現れない                            | Unit | `never offers a team with no members`                   |
| TC-UI-262  | **人数の表示**                | 候補一覧                            | 各候補に人数が出る                           | Unit | `shows the member count on every candidate`             |
| TC-UI-263  | **不揃いの警告**               | 3人 対 1人                         | 警告が出るが、確認へ進める                       | Unit | `warns when the rosters are uneven but still allows the pairing` |
| TC-UI-264  | 自分自身を選ばせない              | チームAを選択                         | チームBの選択肢から消える                       | Unit | `never lets the same team face itself`                  |
| TC-UI-265  | **確認を挟む**                | 2チームを選択                         | 確認を経ないと送信しない                        | Unit | `requires a confirmation before creating the match`     |
| TC-UI-266  | **確認の省略が無い**             | 確認を表示                           | 「次回から表示しない」に相当する要素が存在しない            | Unit | `offers no way to skip the confirmation`                |
| TC-UI-267  | 進行中の試合（1件）              | 自チームの試合が1件                      | 一覧として表示し、開始ボタンを出さない                 | Unit | `lists the single active match`                         |
| TC-UI-268  | **進行中の試合（複数）**           | 自チームの試合が3件                      | **すべて**表示する                          | Unit | `lists every active match, not just the first`          |
| TC-UI-269  | 他チームの試合を混ぜない            | 他チームの試合のみ                       | 進行中として扱わない                          | Unit | `ignores matches that belong to other teams`            |

**TC-UI-268 は ADR-039 ⑧ の要求そのものである。** 管理者が用意した試合は待機列を経由しないため、
1チームへ同時に割り当てられる。先頭の1件だけを案内すると、残りが画面から消える。

**TC-UI-261 と TC-UI-263 を取り違えてはならない。** 無人は選ばせず、不揃いは警告して通す。
**TC-UI-266 は投了（TC-UI-204）と同じ趣旨である。** 取り消せない操作の防御は確認だけであり、
省略可能にすると防御が消える。

TC-UI-244 と TC-UI-248 は**実際に起きていた不具合**である（ADR-038 ③）。保守停止が
`public_settings` に無く画面から見えなかったため、マッチング画面は案内を出さないまま
ボタンを押させ（`QUEUE-007` で弾かれる）、シーズン画面は「受付中」と表示していた。

**停止の種類を増やしたら、必ず両方の画面へ足すこと。** 片方だけ足すと同じ食い違いが戻る。

TC-UI-201 と TC-UI-204 は必須である。**投了の押し間違えは覆せない**（ADR-033 ①）。確認だけが防御であり、
それを省略可能にすると防御が消える。

TC-UI-219 と TC-UI-222 は期待の管理である。単発の通報では措置せず（ADR-033 ④）、結果は覆らない（同 ①）。

TC-UI-235 と TC-UI-238 は必須である。**`maintenance_paused` は障害時手順の手順1であり**（ADR-034 ⑥）、
立てられなければ「無効化した直後に新しい試合が成立する」事故を防げない。実際に配線が漏れていた（ADR-037 ①）。
TC-UI-238 は特に落とし穴で、`false` を「未指定」と取り違えると停止を解除できなくなる。

TC-UI-231 と TC-UI-236 は逆向きの防御である。**効かない設定を運営が調整できる状態は、
設定が足りないのと同じくらい悪い**（ADR-037 ③）。
**画面が実在しない救済を示唆してはならない。**

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
