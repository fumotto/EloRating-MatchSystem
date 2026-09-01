# 10_TestSpecification_Part8_Security.md

# Test Specification — Part 8: セキュリティ

Version: 2.0
Status: Active
Last Updated: 2026-08-03

方針は `10_TestSpecification.md`（Part1）を参照する。

---

# 1. 対象

* Supabase Auth（JWT検証）
* RLSポリシー
* Edge Functions の認可
* データ保護
* 改ざん・リプレイ対策
* 監査

---

# 2. 防御層の区別

本システムには2つの独立した認可の層がある。テストでは両者を区別する。

| 層                       | 対象経路                          | 検証種別        | テスト名の接頭辞           |
| ----------------------- | ----------------------------- | ----------- | ------------------ |
| RLSポリシー                 | クライアント → PostgREST → DB       | Database    | `rls: ...`         |
| Edge Function 内の認可チェック  | クライアント → Edge Function → DB直結 | Integration | `authorization: ...` |

**Edge Function の認可を「RLSのテスト」として記述してはならない。**

ADR-016により Edge Functions は PostgreSQL へ直接接続し、RLSを迂回する。RLSが正しくても Edge Function の認可チェックが欠けていれば防御は破られる。逆も同様である。

---

# 3. テストケース

## 3.1 認証

| ID         | 観点        | 前提条件      | 操作     | 期待結果            | 種別          | テスト名                                              |
| ---------- | --------- | --------- | ------ | --------------- | ----------- | ------------------------------------------------- |
| TC-SEC-001 | 未認証での更新   | 認証なし      | 各Edge Function | `AUTH-001` を返す  | Integration | `authorization: rejects an unauthenticated call`  |
| TC-SEC-002 | 期限切れトークン  | 期限切れJWT   | Edge Function | `AUTH-003` を返す  | Integration | `authorization: rejects an expired token`         |
| TC-SEC-003 | 改ざんトークン   | 署名不正のJWT  | Edge Function | `AUTH-002` を返す  | Integration | `authorization: rejects a tampered token`         |
| TC-SEC-004 | 削除済みユーザー  | 削除されたユーザー | Edge Function | `AUTH-002` を返す  | Integration | `authorization: rejects a deleted user`           |
| TC-SEC-005 | 正常認証      | 有効JWT     | Edge Function | 成功する            | Integration | `authorization: accepts a valid token`            |
| TC-SEC-061 | Bearer以外のヘッダ | `Authorization` が Bearer 形式でない | Edge Function | `AUTH-001` を返す  | Integration | `rejects a non-bearer authorization header`       |
| TC-SEC-006 | 未認証での公開取得 | 認証なし      | Ranking Query | 取得できる           | Database    | `rls: allows anonymous access to the ranking`     |
| TC-SEC-007 | 未認証での非公開取得 | 認証なし      | matches SELECT | 取得できない          | Database    | `rls: blocks anonymous access to matches`         |

TC-SEC-001 と TC-SEC-006 は矛盾しない。ランキングのみ未認証で公開する（ADR-018）。「すべての操作が401になる」ことを期待してはならない。

## 3.2 プロフィール

| ID         | 観点          | 前提条件  | 操作              | 期待結果             | 種別       | テスト名                                              |
| ---------- | ----------- | ----- | --------------- | ---------------- | -------- | ------------------------------------------------- |
| TC-SEC-008 | 自分の更新       | 本人    | profiles UPDATE | 成功する             | Database | `rls: allows updating your own profile`           |
| TC-SEC-009 | 他人の更新       | 他ユーザー | profiles UPDATE | 拒否される            | Database | `rls: blocks updating another profile`            |
| TC-SEC-010 | 管理者ロールの自己付与 | 本人    | クライアントSDKから `app_metadata` の更新を試行 | 拒否される | Integration | `authorization: blocks self-granting the admin role` |
| TC-SEC-011 | 削除の禁止       | 本人    | profiles DELETE | 拒否される            | Database | `rls: blocks profile deletion`                    |

## 3.3 チーム

| ID         | 観点          | 前提条件      | 操作            | 期待結果            | 種別          | テスト名                                                |
| ---------- | ----------- | --------- | ------------- | --------------- | ----------- | --------------------------------------------------- |
| TC-SEC-012 | 直接更新の禁止     | LEADER    | teams UPDATE  | 拒否される           | Database    | `rls: blocks direct team updates from the client`   |
| TC-SEC-013 | **レートの改ざん** | LEADER    | teams UPDATE（`rating`） | 拒否される | Database    | `rls: blocks a leader from editing the rating`      |
| TC-SEC-014 | 直接作成の禁止     | 認証済み      | teams INSERT  | 拒否される           | Database    | `rls: blocks direct team creation`                  |
| TC-SEC-015 | 削除の禁止       | LEADER    | teams DELETE  | 拒否される           | Database    | `rls: blocks team deletion`                         |
| TC-SEC-016 | メンバーの直接操作   | 認証済み      | team_members INSERT | 拒否される     | Database    | `rls: blocks direct membership changes`             |

TC-SEC-013 は重要である。`teams` のUPDATEをLEADERへ許可すると、レートを自由に書き換えられる。

## 3.4 招待

| ID         | 観点           | 前提条件      | 操作                   | 期待結果            | 種別          | テスト名                                                     |
| ---------- | ------------ | --------- | -------------------- | --------------- | ----------- | -------------------------------------------------------- |
| TC-SEC-017 | 自チームの招待参照    | 自チームのメンバー | team_invites SELECT  | 取得できる           | Database    | `rls: lets a member read their own team invites`         |
| TC-SEC-018 | **他チームの招待参照** | 別チームのメンバー | team_invites SELECT  | 取得できない          | Database    | `rls: hides invites of other teams`                      |
| TC-SEC-019 | 未認証での招待参照    | 認証なし      | team_invites SELECT  | 取得できない          | Database    | `rls: hides invites from anonymous visitors`             |
| TC-SEC-020 | 平文の非保存       | 招待発行後     | team_invites取得       | ハッシュ値のみが保存されている | Integration | `authorization: stores only the invite code hash`        |
| TC-SEC-021 | 総当たりの困難性     | －         | 招待コード生成              | 128bit以上のエントロピーを持つ | Unit        | `generates an invite code with sufficient entropy`       |
| TC-SEC-022 | 非LEADERの発行拒否 | MEMBER    | create-team-invite   | `TEAM-005` を返す  | Integration | `authorization: rejects invite creation by a member`     |
| TC-SEC-023 | 期限切れの利用拒否    | 期限切れ招待    | accept-team-invite   | `INVITE-002` を返す | Integration | `authorization: rejects an expired invite`               |
| TC-SEC-024 | 使用済みの利用拒否    | 使用済み招待    | accept-team-invite   | `INVITE-003` を返す | Integration | `authorization: rejects a used invite`                   |

TC-SEC-018 は重要である。招待の参照を全認証ユーザーへ開放すると、任意のチームへ参加できてしまい招待制が無意味になる。

## 3.5 マッチング待機

| ID         | 観点        | 前提条件      | 操作                    | 期待結果   | 種別       | テスト名                                            |
| ---------- | --------- | --------- | --------------------- | ------ | -------- | ----------------------------------------------- |
| TC-SEC-025 | 自チームの参照   | 自チームのメンバー | matching_queue SELECT | 取得できる  | Database | `rls: lets a member read their own queue entry` |
| TC-SEC-026 | 他チームの参照   | 別チームのメンバー | matching_queue SELECT | 取得できない | Database | `rls: hides queue entries of other teams`       |
| TC-SEC-027 | 直接登録の禁止   | 認証済み      | matching_queue INSERT | 拒否される  | Database | `rls: blocks direct queue insertion`            |

## 3.6 試合

| ID         | 観点           | 前提条件      | 操作             | 期待結果           | 種別          | テスト名                                                    |
| ---------- | ------------ | --------- | -------------- | -------------- | ----------- | ------------------------------------------------------- |
| TC-SEC-028 | 直接更新の禁止      | 認証済み      | matches UPDATE | 拒否される          | Database    | `rls: blocks direct match updates`                      |
| TC-SEC-029 | 直接作成の禁止      | 認証済み      | matches INSERT | 拒否される          | Database    | `rls: blocks direct match creation`                     |
| TC-SEC-030 | 削除の禁止        | 認証済み      | matches DELETE | 拒否される          | Database    | `rls: blocks match deletion`                            |
| TC-SEC-031 | 勝者による申告      | 勝者チームのメンバー | report-match   | 成功する           | Integration | `authorization: allows the winning team to report`      |
| TC-SEC-032 | 敗者による申告拒否    | 敗者チームのメンバー | report-match   | `MATCH-005` を返す | Integration | `authorization: rejects a report from the loser`        |
| TC-SEC-033 | 第三者による申告拒否   | 無関係チーム    | report-match   | `MATCH-005` を返す | Integration | `authorization: rejects a report from a third party`    |
| TC-SEC-034 | 敗者による承認      | 敗者チームのメンバー | approve-match  | 成功する           | Integration | `authorization: allows the losing team to approve`      |
| TC-SEC-035 | 第三者による承認拒否   | 無関係チーム    | approve-match  | `MATCH-005` を返す | Integration | `authorization: rejects an approval from a third party` |
| TC-SEC-036 | 第三者による投了の拒絶  | 無関係チーム    | concede-match  | `MATCH-005` を返す | Integration | `authorization: rejects a concession from a third party` |
| TC-SEC-040 | 申告者自身による反対申告 | 申告したチーム   | report-match   | `MATCH-003` を返す | Integration | `authorization: rejects a self counter claim`           |
| TC-SEC-041 | 申請者自身による応答   | 申請したチーム   | respond-no-contest | `MATCH-005` を返す | Integration | `authorization: rejects a self response`            |
| TC-SEC-042 | **通報元チームの詐称** | body に別チームID | create-abuse-report | JWTから導出され無視される | Integration | `authorization: derives the reporter team from the JWT` |
| TC-SEC-043 | 自チームへの通報     | 自チームを対象    | create-abuse-report | `ABUSE-002` を返す | Integration | `authorization: rejects a self report`                 |
| TC-SEC-044 | **通報の非公開**    | 対象チームとして参照 | abuse_reports SELECT | 0件が返る    | Database    | `rls: hides reports from the reported team`            |
| TC-SEC-045 | 他人の通報の取り下げ   | 別利用者の通報    | withdraw-abuse-report | `ABUSE-007` を返す | Integration | `authorization: rejects withdrawing another's report` |
| TC-SEC-046 | **通報から結果への経路** | `COMPLETED` の関連試合 | 通報・措置 | 勝敗もレートも変わらない | Integration | `authorization: never lets a report alter a result`   |
| TC-SEC-037 | 確定済み試合の更新拒否  | `COMPLETED` | 各操作           | `MATCH-002` を返す | Integration | `authorization: rejects changes to a completed match`   |
| TC-SEC-038 | 履歴の改ざん防止     | 認証済み      | rating_history UPDATE | 拒否される     | Database    | `rls: blocks rating history modification`               |
| TC-SEC-039 | 履歴の削除防止      | 認証済み      | rating_history DELETE | 拒否される     | Database    | `rls: blocks rating history deletion`                   |

## 3.7 管理機能

| ID         | 観点          | 前提条件   | 操作                     | 期待結果            | 種別          | テスト名                                                |
| ---------- | ----------- | ------ | ---------------------- | --------------- | ----------- | --------------------------------------------------- |
| TC-SEC-040 | 管理者の許可      | 管理者    | 各管理Function            | 成功する            | Integration | `authorization: allows admin operations`            |
| TC-SEC-041 | 一般利用者の拒否    | 一般利用者  | 各管理Function            | `ADMIN-001` を返す | Integration | `authorization: rejects admin operations for users` |
| TC-SEC-042 | 設定の直接更新拒否   | 一般利用者  | system_settings UPDATE | 拒否される           | Database    | `rls: blocks direct settings updates`               |
| TC-SEC-043 | 監査ログの参照拒否   | 一般利用者  | audit_logs SELECT      | 取得できない          | Database    | `rls: hides the audit log from regular users`       |
| TC-SEC-044 | 監査ログの改ざん防止  | 管理者    | audit_logs UPDATE      | 拒否される           | Database    | `rls: blocks audit log modification`                |
| TC-SEC-045 | 監査ログの削除防止   | 管理者    | audit_logs DELETE      | 拒否される           | Database    | `rls: blocks audit log deletion`                    |

## 3.8 改ざん・リプレイ

| ID         | 観点            | 前提条件           | 操作              | 期待結果                     | 種別          | テスト名                                                        |
| ---------- | ------------- | -------------- | --------------- | ------------------------ | ----------- | ----------------------------------------------------------- |
| TC-SEC-046 | Team IDの改ざん   | 他チームのIDを指定     | queue-match     | `TEAM-005` を返す           | Integration | `authorization: rejects acting on another team`             |
| TC-SEC-047 | Profile IDの改ざん | 他人のIDをボディで指定   | ensure-profile  | JWTのIDが使われ、他人を更新できない     | Integration | `authorization: ignores a profile id from the request body` |
| TC-SEC-048 | Match IDの改ざん  | 無関係な試合のIDを指定   | approve-match   | `MATCH-005` を返す          | Integration | `authorization: rejects acting on an unrelated match`       |
| TC-SEC-049 | 勝者の詐称         | 敗者チームが自チームを勝者と申告 | report-match    | `MATCH-005` を返す          | Integration | `authorization: prevents the loser from claiming a win`     |
| TC-SEC-050 | 二重送信          | 同一リクエストの再送     | approve-match ×2 | 副作用が1回のみ発生する             | Integration | `authorization: applies the side effect only once`          |
| TC-SEC-051 | 古いversionの再送  | 更新後に旧versionで再送 | approve-match   | `MATCH-008` を返す          | Integration | `authorization: rejects a replayed stale version`           |
| TC-SEC-052 | 大量リクエスト       | 短時間に連続送信       | 各Edge Function  | 処理が破綻せず、データ不整合が発生しない     | Integration | `authorization: stays consistent under request flooding`    |

TC-SEC-052 はレート制限の検証ではない。MVPではレート制限を実装しないため、**整合性が保たれること**のみを確認する。

## 3.9 データ保護

| ID         | 観点          | 前提条件  | 操作             | 期待結果                     | 種別          | テスト名                                                    |
| ---------- | ----------- | ----- | -------------- | ------------------------ | ----------- | ------------------------------------------------------- |
| TC-SEC-053 | プロバイダIDの非公開 | 認証済み  | Profile Query  | `providerUserId` を返さない   | Integration | `authorization: never exposes the provider user id`     |
| TC-SEC-054 | ランキングの匿名性   | 未認証   | Ranking Query  | プレイヤー個人を特定できる情報を含まない     | Integration | `authorization: keeps the ranking anonymous`            |
| TC-SEC-055 | ログの秘密情報     | 各操作後  | 実行ログ確認         | トークン・招待コードの平文を含まない       | Integration | `authorization: never logs secrets`                     |
| TC-SEC-056 | エラーの情報量     | 認可失敗時 | Edge Function  | 内部構造を推測できる情報を返さない        | Integration | `authorization: returns a generic authorization error`  |

## 3.10 監査

| ID         | 観点       | 前提条件   | 操作           | 期待結果                          | 種別          | テスト名                                            |
| ---------- | -------- | ------ | ------------ | ----------------------------- | ----------- | ----------------------------------------------- |
| TC-SEC-057 | 管理操作の記録  | 管理操作後  | audit_logs取得 | 記録される                         | Integration | `authorization: records admin actions`          |
| TC-SEC-058 | 認証失敗の記録  | 不正JWT  | audit_logs取得 | `AUTH_FAILED` が記録される          | Integration | `authorization: records failed authentication`  |
| TC-SEC-059 | 権限違反の記録  | 認可失敗   | audit_logs取得 | `AUTHORIZATION_DENIED` が記録される | Integration | `authorization: records authorization failures` |
| TC-SEC-060 | 結果確定の記録  | 試合確定後  | audit_logs取得 | 記録される                         | Integration | `authorization: records match completion`       |

---

# 4. 作成してはならないテスト

| 対象                                | 理由                                       |
| --------------------------------- | ---------------------------------------- |
| チーム削除の許可テスト                       | チーム削除はMVP対象外                             |
| `teams` UPDATE を LEADER へ許可するテスト  | レート改ざんを許すことになる（TC-SEC-013 で拒否を検証する）      |
| 「すべての未認証アクセスが401」のテスト             | ランキングは公開である（ADR-018）                     |
| Edge Function の認可を `rls:` として記述する | 防御層が異なる（2章）                              |

---

# 5. AI実装ルール

* すべてのテーブルでRLSが有効であることを検証する。
* RLSは「許可される」と「拒否される」を対で検証する。
* Edge Function の認可は Integration Test で検証し、RLSテストで代用しない。
* 利用者が自身の `app_metadata` を変更できないことを必ず検証する。`app_metadata` は service_role でのみ更新可能であり、この前提が崩れると管理機能の認可全体が無効になる。
* `teams.rating` をクライアントから変更できないことを必ず検証する。
* 招待の参照が自チームに限定されることを必ず検証する。
* 監査ログが追記専用であることを検証する。
* リプレイにより副作用が二重に発生しないことを検証する。
