# 10_TestSpecification_Part10_E2E.md

# Test Specification — Part 10: E2E

Version: 2.0
Status: Active
Last Updated: 2026-08-03

方針は `10_TestSpecification.md`（Part1）を参照する。

---

# 1. 目的

システム全体を通したユーザーシナリオを検証する。

Playwright を使用し、実際のブラウザ操作に近い形で検証する。

対象は認証・チーム管理・マッチング・試合・ランキング・管理機能とする。

---

# 2. 前提

* 試合フローに「試合開始」の操作は存在しない。マッチ成立と同時に進行中となる（ADR-008）。
* 申告は勝者チームの、承認・拒否は敗者チームのいずれのメンバーでも実行できる（ADR-009）。
* チーム参加は招待制のみである（ADR-013）。
* ランキングは未認証で閲覧できる（ADR-018）。

---

# 3. テストシナリオ

## 3.1 認証とチーム

| ID         | シナリオ        | 前提条件      | 操作                   | 期待結果                      | テスト名                                             |
| ---------- | ----------- | --------- | -------------------- | ------------------------- | ------------------------------------------------ |
| TC-E2E-001 | 初回ログイン      | 認証可能      | ログイン                 | ダッシュボードへ遷移し、プロフィールが作成される  | `completes the first login flow`                 |
| TC-E2E-002 | 再ログイン       | プロフィール作成済 | ログイン                 | プロフィールが重複作成されない           | `reuses the existing profile on re-login`        |
| TC-E2E-003 | チーム作成       | 未所属       | チーム作成フォーム送信          | チームが作成され、作成者がリーダーとなる      | `creates a team and becomes its leader`          |
| TC-E2E-004 | 招待と参加       | リーダー・未所属者 | 招待発行 → コード入力         | メンバーがチームへ参加する             | `invites and joins a member`                     |
| TC-E2E-005 | 招待期限切れ      | 期限切れ招待    | コード入力                | 参加できず、期限切れのメッセージが表示される    | `rejects an expired invite`                      |
| TC-E2E-006 | リーダー移譲      | 複数メンバー    | 移譲操作                 | リーダーが入れ替わる                | `transfers the leader role`                      |
| TC-E2E-007 | チーム脱退       | 一般メンバー    | 脱退操作                 | チームから脱退する                 | `leaves the team`                                |
| TC-E2E-008 | リーダー脱退の制限   | リーダー・他メンバー在籍 | 脱退操作                 | 移譲を促すメッセージが表示され、脱退できない    | `blocks the leader from leaving before transfer` |
| TC-E2E-023 | **ログアウト**    | ログイン済     | ログアウト操作              | トップページへ遷移し、ヘッダーが未ログインの表示へ戻る | `logs out and returns to the top page`           |
| TC-E2E-024 | **保護ルートへの直接遷移** | ログイン済     | `/team`・`/settings` を直接開く | 指定したURLのまま該当画面が表示される（`/dashboard` へ化けない） | `keeps the requested route on a direct visit`    |
| TC-E2E-044 | **トップページ**      | 未ログイン     | `/` を開く                 | ログイン／入場／ルールの3導線が表示される | `shows the top page entry points to anonymous visitors` |
| TC-E2E-045 | **ルールページの公開**   | 未ログイン     | `/rules` を開く            | 閲覧でき、ヘッダーにも導線がある | `serves the rules page to anonymous visitors` |
| TC-E2E-046 | **お知らせの表示**     | お知らせ登録済   | 任意の画面を開く              | ヘッダーに帯が表示される | `shows the announcement banner to anonymous visitors` |
| TC-E2E-047 | **お知らせ未登録**     | お知らせが空    | 任意の画面を開く              | 帯が表示されない | `hides the banner when the announcement is empty` |

## 3.2 マッチングと試合

| ID         | シナリオ            | 前提条件            | 操作                 | 期待結果                          | テスト名                                                   |
| ---------- | --------------- | --------------- | ------------------ | ----------------------------- | ------------------------------------------------------ |
| TC-E2E-009 | マッチング成立         | 2チームが準備完了       | 双方がキュー登録           | 成立通知を受信し、試合画面へ遷移する            | `matches two teams`                                    |
| TC-E2E-010 | **試合開始操作の不在**   | マッチ成立直後         | 試合画面を確認            | 試合は既に進行中であり、開始操作が存在しない        | `starts the match immediately after matchmaking`       |
| TC-E2E-011 | 相手なしの待機         | 1チームのみ待機        | キュー登録              | エラーにならず待機状態が表示される             | `keeps waiting when no opponent is available`          |
| TC-E2E-012 | 待機キャンセル         | 待機中             | 待機解除               | キューから除外される                    | `cancels matchmaking`                                  |
| TC-E2E-013 | 勝利申告            | 進行中             | 勝者が申告              | 勝者報告状態になる                     | `reports the match result`                             |
| TC-E2E-014 | **メンバーによる申告**   | 進行中・勝者チームのメンバー  | 一般メンバーが申告          | 申告できる（リーダー限定ではない）             | `lets a non-leader member report the result`           |
| TC-E2E-015 | 承認と確定           | 勝者報告済み          | 敗者が承認              | 試合が完了し、両チームのレートが更新される         | `completes the match and updates ratings`              |
| TC-E2E-016 | **拒否と再申告**      | 勝者報告済み          | 敗者が拒否 → 勝者が再申告     | 進行中へ戻り、再度申告できる                | `returns to playing after a rejection`                 |
| TC-E2E-017 | **拒否上限での解散**    | 拒否上限に到達         | 敗者が拒否              | 引き分けとして解散し、レートが変化しない          | `draws the match when the reject limit is reached`     |
| TC-E2E-018 | **承認期限切れの自動承認** | 承認期限を経過（期限を短縮）  | 待機後に画面を確認          | 自動承認され、レートが更新される              | `auto-approves the match after the deadline`           |
| TC-E2E-019 | **申告期限切れの解散**   | 申告期限を経過（期限を短縮）  | 待機後に画面を確認          | 引き分けとして解散し、レートが変化しない          | `draws the match when nobody reports`                  |
| TC-E2E-020 | 試合中の制限          | 進行中             | キュー登録を試行           | 登録できない                        | `blocks matchmaking while a match is in progress`      |
| TC-E2E-021 | 解散後の再マッチング      | 直前の試合が `DRAWN`  | キュー登録              | 登録できる                         | `allows matchmaking again after a draw`                |
| TC-E2E-022 | **必須人数未満の制限**    | 必須人数に満たないチーム     | マッチング画面を開く         | 不足の案内と開始ボタンが同時に表示され、ボタンは非活性である | `blocks matchmaking for a team below the required size` |
| TC-E2E-043 | **マッチング成立の演出**   | 2チームが待機          | 相手が見つかる            | 相手名・両チームのレート・勝敗時の変動が表示され、試合へ遷移できる | `shows the match details and moves to the match` |
| TC-E2E-048 | **確定時のレート変動表示**  | 申告 → 承認で確定      | 試合画面を確認            | 勝敗の別とレートの変動前後が表示される | `shows the rating change after the match is confirmed` |

TC-E2E-009 / 011 / 012 / 020 / 021 は、チームが必須人数（`team_max_members`）を満たしていることを前提とする（`09_MatchmakingSpecification.md` 4.1）。テストは招待経路でチームを定員まで埋めてから待機を行う。

TC-E2E-018 と TC-E2E-019 は、テスト実行時間を短縮するため管理APIで期限を最小値へ変更してから実施する。

**★本書には節をまたいだID重複が残っている**（009 / 018 / 019 / 022 / 023 / 024 / 029 / 038）。
節ごとに採番したことに由来する既存の不整合であり、実装済みテストのコメントは
一意な番号を用いている。新規追加は 043 以降の空き番号を使うこと。

## 3.3 ランキング

| ID         | シナリオ           | 前提条件      | 操作          | 期待結果               | テスト名                                             |
| ---------- | -------------- | --------- | ----------- | ------------------ | ------------------------------------------------ |
| TC-E2E-022 | ランキング更新        | 試合完了      | ランキング画面を表示  | 順位とレートが更新されている     | `reflects the match result in the ranking`       |
| TC-E2E-023 | **未認証での閲覧**    | ログアウト状態   | ランキング画面へ直接遷移 | 表示できる              | `serves the ranking to anonymous visitors`       |
| TC-E2E-024 | **引き分けの非計上**   | `DRAWN` の試合が存在 | ランキング画面を表示  | 試合数に計上されない         | `excludes drawn matches from the record`         |
| TC-E2E-025 | **試合未実施チームの表示** | 新規チーム     | ランキング画面を表示  | 一覧に表示され、勝率が空欄で示される | `lists teams that have never played`             |

## 3.4 管理機能

| ID         | シナリオ       | 前提条件   | 操作            | 期待結果                   | テスト名                                          |
| ---------- | ---------- | ------ | ------------- | ---------------------- | --------------------------------------------- |
| TC-E2E-026 | チームBAN     | 管理者    | BAN実行         | BANチームがマッチングできなくなる     | `bans a team and blocks its matchmaking`      |
| TC-E2E-027 | BAN後のランキング | BAN実行後  | ランキング画面を表示    | BANチームが表示されない          | `hides banned teams from the ranking`         |
| TC-E2E-028 | K値変更       | 管理者    | K値変更後に試合を完了   | 変更後のK値でレートが計算される       | `applies the updated K factor`                |
| TC-E2E-029 | 人数上限変更     | 管理者    | 上限変更後に招待参加    | 新しい上限で判定される            | `applies the updated member limit`            |
| TC-E2E-032 | 監査ログ       | 管理操作後  | 監査ログ画面を表示     | 実施した操作が記録されている         | `shows the performed actions in the audit log` |
| TC-E2E-033 | 管理画面の保護    | 一般利用者  | 管理画面へアクセス     | アクセスが拒否される             | `rejects admin access for a regular user`     |
| TC-E2E-049 | **BAN中の凍結**  | BAN済みチーム | チーム画面・マッチング画面を確認 | 脱退・招待・マッチングのいずれも操作できない  | `freezes roster changes and matchmaking`      |

## 3.5 権限と異常系

| ID         | シナリオ         | 前提条件       | 操作              | 期待結果             | テスト名                                                 |
| ---------- | ------------ | ---------- | --------------- | ---------------- | ---------------------------------------------------- |
| TC-E2E-034 | 他チームへの操作     | 一般利用者      | 他チームの操作を試行      | 権限エラーとなる         | `rejects operations on another team`                 |
| TC-E2E-035 | 敗者による申告      | 敗者チーム      | 勝利申告を試行         | 権限エラーとなる         | `rejects a report from the losing team`              |
| TC-E2E-036 | 通信障害からの復帰    | API一時停止後に復旧 | 画面操作            | エラー表示後、再試行で成功する  | `recovers from a temporary network failure`          |
| TC-E2E-037 | ページ再読み込み     | 進行中の試合     | 再読み込み           | 状態が正しく復元される      | `restores the match state after a reload`            |
| TC-E2E-038 | **直リンクの解決**  | 認証済み       | `/matches/:id` へ直接アクセス | 404にならず表示される     | `resolves a deep link on the deployed site`          |
| TC-E2E-039 | **同時操作の競合**  | 同一チームの2名   | 2ブラウザから同時に承認    | 一方のみ成功し、レート更新は1回 | `applies the approval exactly once under contention` |

TC-E2E-038 は GitHub Pages のSPA配信に関わる（`11_Deployment.md`）。ビルド設定を誤ると本番のみ404になるため、本番相当の配信構成で検証する。

## 3.6 同期と回帰

| ID         | シナリオ           | 前提条件      | 操作                                    | 期待結果            | テスト名                                          |
| ---------- | -------------- | --------- | ------------------------------------- | --------------- | --------------------------------------------- |
| TC-E2E-040 | Realtime同期     | 2ブラウザで同一試合 | 一方が申告                                 | もう一方の画面が自動更新される | `syncs the match state across clients`        |
| TC-E2E-041 | ランキングの同期       | 2ブラウザ     | 一方で試合完了                               | もう一方のランキングが更新される | `syncs the ranking across clients`            |
| TC-E2E-042 | **主要フロー回帰テスト** | 新規環境      | ログイン → チーム作成 → 招待 → マッチング → 申告 → 承認 → ランキング確認 | 一連が正常に動作する      | `completes the full application flow`         |

## 3.7 チームメンバーの確認とマニュアル

| ID         | シナリオ            | 前提条件      | 操作                | 期待結果                  | テスト名                                          |
| ---------- | --------------- | --------- | ----------------- | --------------------- | --------------------------------------------- |
| TC-E2E-050 | **ランキングからの確認**  | 認証済み・未所属  | ランキングのチーム名を選ぶ     | 他チームのメンバーと役割が表示される    | `reaches another team's members from the ranking` |
| TC-E2E-051 | 未認証への非表示        | 未認証       | ランキングを表示          | チーム名がリンクにならない         | `hides the link from signed-out visitors`     |
| TC-E2E-052 | **試合からの確認**     | 試合成立後     | 試合画面の相手チーム名を選ぶ    | 相手チームのメンバーが表示される      | `reaches the opponent's members from the match` |
| TC-E2E-053 | **マニュアルの導線**    | 未認証       | トップページを表示          | 2つのマニュアルへのリンクが表示される    | `offers the manuals from the top page`        |

メンバー一覧は `team_detail_view` から取得する。同Viewは認証済み限定であり（`03_Database.md` 11.1）、
未認証にはリンク自体を出さない。押してもログイン画面へ弾かれるだけの導線を作らないためである。

## 3.8 シーズン（ADR-030）

| ID         | シナリオ           | 前提条件      | 操作                 | 期待結果                            | テスト名                                          |
| ---------- | -------------- | --------- | ------------------ | ------------------------------- | --------------------------------------------- |
| TC-E2E-054 | **猶予中の停止と復帰**  | 定員を満たしたチーム | 終了を開始 → 取りやめ        | 猶予中はマッチング開始が非活性になり、取りやめで戻る | `pauses matchmaking and blocks user updates through the season change` |
| TC-E2E-055 | 管理画面の保護        | 一般利用者     | `/admin/season` を開く | シーズン操作が表示されない                   | `hides the manual reset entry points from a regular user` |
| TC-E2E-056 | 過去シーズンの公開      | 未認証       | `/seasons` を開く      | 一覧が表示される                        | `shows the season archive to anonymous visitors` |

TC-E2E-054 は定員を満たしたチームで行う。**人数不足でも開始ボタンは非活性になるため**、
定員を満たしていないと「停止したから非活性」であることを確かめられない。

---

# 4. テストデータ

Part1 5章の定義を使用する。E2E固有の名称を定義しない。

| アカウント      | 所属     | 役割     |
| ---------- | ------ | ------ |
| PLAYER_A1  | TEAM_A | LEADER |
| PLAYER_A2  | TEAM_A | MEMBER |
| PLAYER_B1  | TEAM_B | LEADER |
| PLAYER_B2  | TEAM_B | MEMBER |
| ADMIN_USER | 未所属    | 管理者    |

認証はテスト環境ではモック認証またはテスト用プロバイダを利用する（ADR-015）。

---

# 5. 実行方針

## 5.1 期限を伴うシナリオ

自動解決（TC-E2E-018、TC-E2E-019）は、管理APIで `report_timeout_minutes` および `approve_timeout_minutes` を最小値へ変更してから実施する。

固定時間の待機（`sleep`）ではなく、状態変化の待機を使用する。

## 5.2 独立性

各シナリオは独立して実行でき、実行順に依存しないこと。

前提データはフィクスチャで用意し、シナリオ間で共有しない。

---

# 6. 作成してはならないテスト

| 対象                | 理由                          |
| ----------------- | --------------------------- |
| 「試合開始」ボタンの操作      | 該当する操作が存在しない（ADR-008）       |
| チーム削除のシナリオ        | MVP対象外                      |
| 招待によらないチーム参加のシナリオ | 参加は招待制のみ（ADR-013）           |

---

# 7. AI実装ルール

* Playwright を使用し、ブラウザ操作をユーザー視点で実施する。
* セレクタは `data-testid` ではなく、可能な限りロール・ラベル・表示テキストを利用する。
* Realtime を利用するシナリオは複数ブラウザコンテキストで検証する。
* テストは互いに独立させ、実行順に依存させない。
* 共通処理（ログイン・チーム作成など）は Playwright Fixture として共通化する。
* 長時間待機を避け、イベント待機・状態待機を使用する。
* 期限に関わるシナリオは設定値を短縮してから実施する。
