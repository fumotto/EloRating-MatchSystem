# 07_APISequence.md

# API Sequence Specification

Version: 2.0
Status: Active
Last Updated: 2026-08-03
準拠ADR: ADR-007, ADR-008, ADR-009, ADR-010, ADR-013, ADR-014, ADR-015, ADR-016, ADR-017

---

# 1. 目的

本書は、各処理の実行シーケンスを定義する。

本書は「どの順序で処理するか」の正本である。入出力（DTO）の定義は `04_BackendInterface.md`、テーブル構造は `03_Database.md`、エラーコードは `06_ErrorCode.md` を参照する。

本書に DTO・テーブル定義・エラーコード一覧を重複して記載してはならない。

---

## 1.1 呼び出し方式について

**本システムはREST APIを提供しない。**

クライアントは Supabase Client SDK により Edge Function 名で呼び出す。

```typescript
await supabase.functions.invoke("create-team", { body: { name } });
```

`POST /teams` のようなRESTパスは存在しない。本書では Edge Function 名で処理を示す。

---

# 2. 共通処理フロー

すべてのEdge Functionは以下の共通フローに従う。

```text
1. HTTPリクエスト受信
2. JWT検証（Service Role実行のFunctionを除く）
3. 入力バリデーション
4. DB接続の取得（Connection Pooler経由）
5. BEGIN
6. 認可チェック（DB直結によりRLSを迂回するため必須）
7. 業務ルールの検証
8. データ更新
9. 監査ログの記録
10. COMMIT（失敗時は ROLLBACK）
11. Realtime通知（コミット成功後）
12. レスポンス返却（result 形式）
```

## 2.1 認可チェックが必須である理由

ADR-016により、Edge FunctionsはPostgreSQLへ直接接続する。この接続はRLSを迂回するため、RLSによる保護が効かない。

したがって、Edge Function内での認可チェックを省略してはならない。

## 2.2 Realtime通知の位置

Realtime通知は必ず **COMMIT成功後** に送信する。

通知の送信に失敗してもトランザクションをロールバックしない。通知失敗はログへ記録し、クライアントは次回の取得で最新状態を得る（`06_ErrorCode.md` 14章）。

---

# 3. ログイン

## Function

`ensure-profile`

## シーケンス

```text
1. クライアントが外部OAuthプロバイダで認証する
2. Supabase Auth がセッションを確立し、JWTを発行する
3. クライアントが ensure-profile を呼び出す
4. JWTから auth_provider と provider_user_id を取得する
5. profiles を id（= auth.users.id）で検索する
6. 存在する場合
     display_name・avatar_url を同期して返却する
7. 存在しない場合
     profiles へ INSERT して返却する
8. クライアントが所属チーム・進行中の試合を取得する
```

プロフィールの作成主体は `ensure-profile` である。DBトリガによる自動作成は行わない（`04_BackendInterface.md` 4.1）。

`auth_provider` の値域は `steam` または `discord` とする（ADR-015）。MVPで使用するのは `discord` である（ADR-022）。

プロバイダ固有の処理をシーケンスへ記載しない。

---

# 4. チーム作成

## Function

`create-team`

## シーケンス

```text
1. JWT検証
2. 入力検証（チーム名 1〜30文字）
3. BEGIN
4. 所属確認（team_members に呼び出しユーザーが存在しないこと）
5. system_settings から initial_rating を取得
6. teams INSERT
7. team_members INSERT（role = 'LEADER'）
8. audit_logs INSERT（TEAM_CREATED）
9. COMMIT
10. チーム情報を返却
```

## Rollback条件

* チーム名の重複（UNIQUE制約違反）
* 既にチームへ所属している
* DBエラー

チーム作成者は LEADER として登録される（ADR-010）。

---

# 5. チーム招待

## 5.1 招待発行

### Function

`create-team-invite`

### シーケンス

```text
1. JWT検証
2. BEGIN
3. LEADER確認
4. BAN確認
5. 人数上限の確認
6. 既存の ACTIVE な招待を検索
7. 存在する場合は status = 'REVOKED' へ更新
8. 招待コードを生成（128bit以上のエントロピー）
9. ハッシュ値を team_invites へ INSERT
10. COMMIT
11. 平文の招待コードを返却
```

招待コードはハッシュ化して保存するため、発行済みコードの平文を再取得できない。再発行時は旧招待を無効化する。

### 5.2 招待参加

#### Function

`accept-team-invite`

#### シーケンス

```text
1. JWT検証
2. 招待コードをハッシュ化
3. BEGIN
4. team_invites をハッシュ値で検索
5. status = 'ACTIVE' であることを確認
6. expires_at > now() であることを確認
7. チームのBAN確認
8. 呼び出しユーザーの未所属確認
9. チーム人数を再確認（FOR UPDATE により定員超過を防ぐ）
10. team_members INSERT
11. team_invites UPDATE（status='USED'、used_at、used_by_profile_id）
12. COMMIT
13. Realtime: TEAM_MEMBER_UPDATED
```

手順9をトランザクション内で行うのは、複数名が同時に同じ招待を使用した場合の定員超過を防ぐためである。

---

# 6. チーム脱退・リーダー移譲

## 6.1 脱退

### Function

`leave-team`

### シーケンス

```text
1. JWT検証
2. BEGIN
3. 所属確認
4. 進行中試合の確認
     matches に status が COMPLETED・DRAWN 以外のレコードが無いこと
5. LEADER かつ 他メンバーが存在する場合は TEAM-008 を返す
6. matching_queue に登録があれば DELETE
7. team_members DELETE
8. COMMIT
9. Realtime: TEAM_MEMBER_UPDATED
```

最後の1人が脱退した場合、チームはメンバー0人のまま残存する。チーム削除はMVP対象外である。

---

## 6.2 リーダー移譲

### Function

`transfer-leader`

### シーケンス

```text
1. JWT検証
2. BEGIN
3. 現LEADER確認
4. 譲渡先が同一チームに所属していることを確認
5. 自己譲渡でないことを確認
6. 現LEADER を MEMBER へ UPDATE
7. 譲渡先を LEADER へ UPDATE
8. COMMIT
9. Realtime: TEAM_MEMBER_UPDATED
```

手順6と7の順序を入れ替えてはならない。部分UNIQUEインデックス `ux_team_members_leader` により、1チームに2人のLEADERが同時に存在できないためである。

---

# 7. マッチング待機

## Function

`queue-match`

## シーケンス

```text
1. JWT検証
2. BEGIN
3. LEADER確認
4. BAN確認
5. 進行中試合の確認
6. 重複登録の確認
7. matching_queue INSERT
8. マッチング処理を実行（8章）
9. COMMIT
10. 成立した場合 Realtime: MATCH_CREATED
11. matched（成立可否）を含めて返却
```

相手が見つからない場合もエラーではない。`matched: false` を返し、待機を継続する（`06_ErrorCode.md` 10章）。

## キャンセル

### Function

`cancel-match-queue`

```text
1. JWT検証
2. BEGIN
3. LEADER確認
4. 待機中であることを確認
5. matching_queue DELETE
6. COMMIT
```

マッチが成立した直後はキューから削除済みのため、キャンセルは失敗する（`QUEUE-004`）。

---

# 8. マッチング処理

## Function

`matchmaker`

## シーケンス

```text
1. advisory lock 取得（多重実行の防止）
2. 待機チームを取得（FOR UPDATE SKIP LOCKED）
3. BANチーム・進行中試合のあるチームを除外
4. system_settings から match_rating_range を取得
5. レート差が許容範囲内の候補を抽出
6. 優先順位で相手を決定
     第1優先: レート差が最小
     第2優先: 待機開始が最も早い
     第3優先: Team ID 昇順
7. matches INSERT
     status = 'PLAYING'
     started_at = now()
     report_deadline_at = now() + report_timeout_minutes
8. matching_queue DELETE ×2
9. audit_logs INSERT（MATCH_CREATED）
10. COMMIT
11. Realtime: MATCH_CREATED
```

優先順位は「レート差 → 待機時間 → Team ID」である。待機時間を第1優先としてはならない（`09_MatchmakingSpecification.md`）。

チーム状態を更新する手順は存在しない。`teams` に状態列を持たないためである（`03_Database.md` 7.3）。

マッチ成立と同時に試合が `PLAYING` となる。試合開始という別の操作は存在しない（ADR-008）。

## Rollback条件

* matches の INSERT失敗（同時1試合制約の違反を含む）
* matching_queue の DELETE失敗

---

# 9. 勝利申告

## Function

`report-match`

## シーケンス

```text
1. JWT検証
2. BEGIN
3. 試合取得
4. 状態確認（PLAYING であること）
5. winnerTeamId が参加チームであることを確認
6. 呼び出しユーザーが winnerTeamId のチームに所属していることを確認
7. approve_deadline_at = now() + approve_timeout_minutes を算出
8. matches UPDATE（楽観ロック: WHERE version = :version）
     status = 'WINNER_REPORTED'
     winner_team_id、reported_by_profile_id、reported_at
     approve_deadline_at
     version = version + 1
9. 更新件数が0件なら MATCH-008 を返して ROLLBACK
10. audit_logs INSERT（MATCH_REPORTED）
11. COMMIT
12. Realtime: WINNER_REPORTED
```

**レート更新は行わない。**

申告は勝者チームのいずれのメンバーでも実行できる（ADR-009）。同一チーム内で同時に申告した場合、楽観ロックにより1件のみ成功する。

**勝者申告は代替の経路である。** 基本の経路は投了（9.1）であり、勝者申告は敗者が投了しない場合に用いる（ADR-032 ①）。

## 9.1 投了（基本の経路）

### Function

`concede-match`

### シーケンス

```text
1. JWT検証
2. BEGIN
3. assertUpdatesAllowed（シーズン切替中でないこと）
4. 試合取得
5. 状態確認（PLAYING または WINNER_REPORTED）
6. 呼び出しユーザーの所属チームを特定（＝敗者）。相手が勝者となる
7. WINNER_REPORTED の場合、自チームが winner_team_id でないことを確認（MATCH-009）
8. completeMatch()（_shared/match-completion.ts）
     両チームの行を ID順に FOR UPDATE してから読む
     Elo計算 → matches UPDATE（楽観ロック） → rating_history ×2 → teams ×2
9. 更新件数が0件なら MATCH-008 を返して ROLLBACK
10. audit_logs INSERT（MATCH_CONCEDED）
11. COMMIT
12. Realtime: MATCH_COMPLETED、RANKING_UPDATED
```

**承認を要さない。** 自分に不利な申告に虚偽の動機は無いためである。

**クールダウンを課さない。** 投了は最短で次のキューへ入れる道である（ADR-032 ④）。

**`winnerTeamId` を入力に取らない。** 受け取ると、投了に見せかけて相手の敗北を登録できる。

## 9.2 反対申告

### Function

`report-match`（`WINNER_REPORTED` の試合に対する呼び出し）

### シーケンス

```text
1. JWT検証
2. BEGIN
3. 試合取得
4. 状態確認（WINNER_REPORTED であること）
5. 呼び出しユーザーの所属チームが winner_team_id と異なることを確認（同じなら MATCH-003）
6. counter_claim_team_id が未設定であることを確認（設定済みなら MATCH-003）
7. matches UPDATE（楽観ロック）
     counter_claim_team_id、counter_claimed_at
     ★approve_deadline_at は変更しない
     version = version + 1
8. audit_logs INSERT（MATCH_COUNTER_CLAIMED）
9. COMMIT
10. Realtime: MATCH_COUNTER_CLAIMED
```

**★`approve_deadline_at` を延長してはならない。** 延長できると、反対申告が期限を引き延ばす道具になる。

**★この時点から自動承認が止まる。** 競合はいずれかの**投了**でのみ解ける。解けないまま承認期限を過ぎると
`DRAWN`（`CONFLICT`）となり、両チームがクールダウンと不戦を負う（12章）。

**★競合の解消に専用の操作を設けない。** 相手の主張を認めることは投了と同義であり、9.1 を用いる。

---

# 10. 承認

## Function

`approve-match`

## シーケンス

```text
1. JWT検証
2. BEGIN
3. 試合取得
4. 状態確認（WINNER_REPORTED であること）
5. 呼び出しユーザーが敗者チームに所属していることを確認
6. system_settings から rating_k を取得
7. Elo計算（TypeScript純粋関数）
     08_RatingSpecification.md の計算式に従う
     勝者の変動量を確定し、敗者へその符号反転値を適用する
8. matches UPDATE（楽観ロック）
     status = 'COMPLETED'
     approved_by_profile_id、approved_at、completed_at
     version = version + 1
9. 更新件数が0件なら MATCH-008 を返して ROLLBACK
10. rating_history INSERT ×2（k_value を含む）
11. teams UPDATE ×2（rating）
12. audit_logs INSERT（MATCH_APPROVED）
13. COMMIT
14. Realtime: MATCH_COMPLETED、RANKING_UPDATED
```

承認は敗者チームのいずれのメンバーでも実行できる（ADR-009）。

## Rollback条件

* 楽観ロックの競合
* rating_history の登録失敗
* teams の更新失敗（レート下限のCHECK制約違反を含む）

---

# 11. 不成立の申請

`reject-match`（拒否）は **ADR-032 ② により廃止した。** 敗者が単独で試合を消せる経路だったためである。
本章はその位置に入る新しい機構である。

## Function

`request-no-contest` / `respond-no-contest`

## 11.1 申請

```text
1. JWT検証
2. BEGIN
3. assertUpdatesAllowed
4. 試合取得
5. 状態確認（PLAYING であること。WINNER_REPORTED は不可）
6. 参加チームのメンバーであることを確認
7. 保留中の申請が無いことを確認（あれば MATCH-011）
8. no_contest_request_count < max_no_contest_requests を確認（超なら MATCH-012）
9. matches UPDATE（楽観ロック）
     no_contest_requested_by_team_id、no_contest_requested_at、no_contest_reason_code
     no_contest_request_count = no_contest_request_count + 1
10. audit_logs INSERT（MATCH_NO_CONTEST_REQUESTED）
11. COMMIT
12. Realtime: MATCH_NO_CONTEST_REQUESTED
```

**申請はマッチ成立の直後から出せる。** 時間の制限は申請の可否ではなく、**沈黙が試合を終わらせる時刻**に置く
（ADR-032 ⑧）。これにより、対戦できないと分かった時点で直ちに申請できる。

**`PLAYING` に限る**（ADR-034 ②）。`WINNER_REPORTED` から認めると、敗者が勝者へ取り消しを交渉する経路になる。

## 11.2 応答：承諾（→ DRAWN / MUTUAL）

```text
1. JWT検証
2. BEGIN
3. 試合取得。申請者と異なるチームであることを確認（同じなら MATCH-005）
4. matches UPDATE（楽観ロック）
     status = 'DRAWN'、no_contest_reason = 'MUTUAL'
     winner_team_id = NULL、completed_at = now()
     no_contest_requested_* を NULL へ戻す
5. ★レートを更新しない。rating_history も作らない
6. ★両チームにクールダウンを課さない
7. 当日の MUTUAL 件数が mutual_no_contest_daily_limit を超える場合のみクールダウンを課す
8. no_contest_reason_code = 'CONNECTION' なら match_avoidance へ登録
     team_low_id / team_high_id は UUID の大小で正規化する
     チームあたり max_avoidance_entries を超える場合は最も古い行を失効させる
9. audit_logs INSERT（MATCH_NO_CONTEST_ACCEPTED）
10. COMMIT
11. Realtime: MATCH_DRAWN
```

**承諾は即時に成立する。** 猶予（`no_show_response_minutes`）を待たない。

**★`match_avoidance` への登録は承諾ブランチのみ。** `NO_SHOW` では登録しない。片方の操作で登録できると、
強い相手を恒久的に回避する手段になる（ADR-034 ③）。

## 11.3 応答：対戦継続（→ PLAYING のまま）

```text
1. JWT検証
2. BEGIN
3. 試合取得。申請者と異なるチームであることを確認
4. matches UPDATE（楽観ロック）
     no_contest_requested_by_team_id / _at / _reason_code を NULL へ戻す
     ★report_deadline_at は変更しない
5. audit_logs INSERT（MATCH_NO_CONTEST_DECLINED）
6. COMMIT
7. Realtime: MATCH_NO_CONTEST_DECLINED
```

**勝利申告・投了・延長も応答とみなす。** それぞれの処理の中で保留中の申請をクリアする。
相手は1回の操作で申請を無効化できる。

**★`report_deadline_at` を変更しない。** 申請と応答を繰り返して期限を伸ばせると、
旧「拒否」と同じ引き延ばしが復活する。

## 11.4 応答なし（→ DRAWN / NO_SHOW）

`auto-resolve-matches` が処理する（12章）。`respond-no-contest` は関与しない。

## Rollback条件

* 楽観ロックの競合
* `match_avoidance` の登録失敗（UNIQUE違反を含む）

---

# 12. 自動解決

## Function

`auto-resolve-matches`

## Trigger

Cron（1分間隔）

## シーケンス

```text
1. advisory lock 取得（多重起動の防止）

2. 報告期限切れの処理
   対象: status = 'PLAYING' AND report_deadline_at < now()
   各試合ごとに
     BEGIN
     matches UPDATE（status='DRAWN'、completed_at、version+1）
     audit_logs INSERT（MATCH_DRAWN）
     COMMIT
     Realtime: MATCH_DRAWN
   レート更新・rating_history 作成は行わない

3. 承認期限切れの処理
   対象: status = 'WINNER_REPORTED' AND approve_deadline_at < now()
   各試合ごとに
     BEGIN
     system_settings から rating_k 取得
     Elo計算
     matches UPDATE
       status = 'COMPLETED'
       auto_approved = TRUE
       approved_at = now()、completed_at = now()
       approved_by_profile_id は NULL のまま
       version + 1
     rating_history INSERT ×2
     teams UPDATE ×2
     audit_logs INSERT（MATCH_AUTO_APPROVED）
     COMMIT
     Realtime: MATCH_COMPLETED、RANKING_UPDATED
```

各試合を個別のトランザクションで処理する。1件の失敗が他の試合の処理を妨げないようにするためである。

`approved_by_profile_id` が NULL のまま `COMPLETED` となるのは自動承認のみである。`auto_approved = TRUE` によりCHECK制約を満たす（`03_Database.md` 10.6）。

---

## 12.1 処理の4分類（ADR-032 / ADR-034）

| 対象                                                                                    | 結末                         | クールダウン    |
| ------------------------------------------------------------------------------------- | -------------------------- | --------- |
| `PLAYING` かつ `report_deadline_at < NOW()`                                              | `DRAWN` / `REPORT_TIMEOUT` | 両チーム      |
| `PLAYING` かつ保留中の申請があり満期を過ぎた                                                            | `DRAWN` / `NO_SHOW`        | 無応答側のみ    |
| `WINNER_REPORTED` かつ期限切れ かつ `counter_claim_team_id IS NULL`                            | `COMPLETED`（自動承認）          | 放置した敗者側のみ |
| `WINNER_REPORTED` かつ期限切れ かつ `counter_claim_team_id IS NOT NULL`                        | `DRAWN` / `CONFLICT`       | 両チーム      |

**★自動承認の条件に `counter_claim_team_id IS NULL` を必ず含めること。** 含めないと、矛盾する2つの主張が
あるにもかかわらず先に申告した側で確定してしまい、**早く嘘をついた側が勝つ。**

## 12.2 無応答による解散の満期

```sql
WHERE status = 'PLAYING'
  AND no_contest_requested_at IS NOT NULL
  AND started_at + (no_show_minutes || ' minutes')::interval < NOW()
  AND no_contest_requested_at + (no_show_response_minutes || ' minutes')::interval < NOW()
```

**2つの条件は AND である。** どちらか一方では、対戦直後の申請が相手の短い離席で成立してしまう。

**★クールダウンは無応答側にのみ課す。** 申請側は妨害の被害者であり、代償を負う理由が無い。
不戦の計上も無応答側のみである（ADR-032 ⑧）。

## 12.3 CONFLICT への確定

`winner_team_id` を NULL にする（`chk_matches_drawn` の要求）。
**`reported_by_profile_id` / `reported_at` / `counter_claim_team_id` / `counter_claimed_at` は残す。**
誰がどちらを主張したかは通報の判断材料になる（ADR-033 ④）。

`counter_claim_team_id` が判れば、元の申告者はもう一方のチームであると一意に定まる。

## 12.4 試合ごとに独立したトランザクション

対象の抽出は1つのトランザクションで行い、確定は試合ごとに分ける。**1件の失敗が他の試合を巻き込まない。**
`pg_advisory_xact_lock` により試合ごとに直列化する（既存方針を維持）。

# 13. ランキング取得

## 方式

Query（Edge Functionではない）

## シーケンス

```text
1. team_ranking_view を SELECT
2. rating DESC, wins DESC, team_name ASC で取得
3. Limit / Offset を適用
```

未認証でも取得できる（ADR-018）。

BANチームはView側で除外済みのため、クライアントで除外処理を行わない。

順位は View の `RANK()` により算出済みである。

---

# 14. 管理機能

すべての管理操作は `audit_logs` へ記録する（ADR-017）。

管理者判定は、検証済みJWTの `app_metadata.role` が `admin` であることにより行う（ADR-020）。DBアクセスを伴わない。

## 14.1 チームBAN

### Function

`admin-ban-team`

```text
1. JWT検証
2. BEGIN
3. 管理者確認
4. チーム取得
5. teams UPDATE（is_banned = TRUE）
6. matching_queue DELETE
7. audit_logs INSERT（TEAM_BANNED、reason を payload へ）
8. COMMIT
9. Realtime: TEAM_UPDATED
```

進行中の試合は中断しない。BANの効果は試合終了後に現れる。

---

## 14.2 BAN解除

### Function

`admin-unban-team`

```text
1. JWT検証
2. BEGIN
3. 管理者確認
4. teams UPDATE（is_banned = FALSE）
5. audit_logs INSERT（TEAM_UNBANNED）
6. COMMIT
7. Realtime: TEAM_UPDATED
```

---

## 14.3 システム設定変更

### Function

`admin-update-system-settings`

```text
1. JWT検証
2. BEGIN
3. 管理者確認
4. 入力値検証（CHECK制約に従う）
5. system_settings UPDATE（id = 1）
6. audit_logs INSERT（SETTINGS_UPDATED、変更前後の値を payload へ）
7. COMMIT
8. Realtime: SYSTEM_SETTINGS_UPDATED
```

K値の変更は進行中の試合にも影響する。レート計算は試合の完了時点で行われ、その時点の `rating_k` を使用するためである。適用されたK値は `rating_history.k_value` に保存される。

---

# 15. 通報（ADR-033）

## Function

`create-abuse-report` / `withdraw-abuse-report` / `admin-resolve-abuse-report`

## シーケンス（登録）

```text
1. JWT検証（チーム所属は不要。無所属でも通報できる）
2. BEGIN
3. ★assertUpdatesAllowed を呼ばない
     通報は勝敗にもレートにも影響しないため、シーズン切替中でも受け付ける
4. 通報者の所属チームを team_members から取得（無所属なら NULL）
     ★クライアントから reporterTeamId を受け取らない。詐称できるため
5. 対象チームの存在確認（ABUSE-001）
6. 自チーム宛でないことを確認（ABUSE-002）
7. matchId 指定時 … 試合の存在確認 → 重複通報の確認（ABUSE-003）
   matchId 未指定時 … 同一対象への24時間以内の通報が無いことを確認（ABUSE-004）
8. abuse_reports INSERT（status = 'OPEN'）
9. audit_logs INSERT（ABUSE_REPORTED / target_type = 'TEAM'）
10. COMMIT
11. ★Realtime通知を送らない。通報の発生を誰にも知らせない
```

**★試合を一切更新しない。** 通報は勝敗フローから完全に独立している（ADR-033 ②）。

## シーケンス（措置）

```text
1. JWT検証 → 管理者確認
2. BEGIN
3. 通報取得。status = 'OPEN' を確認（ABUSE-006）
4. resolution により分岐
     NO_ACTION / WARNED … 記録のみ
     COOLDOWN          … teams.queue_cooldown_until = now() + cooldownMinutes
     BANNED            … チームBAN処理（_shared/team-sanction.ts。admin-ban-team と共用）
5. abuse_reports UPDATE（status / resolved_by_profile_id / resolved_at / resolution_note）
6. audit_logs INSERT（ABUSE_RESOLVED）
7. COMMIT
8. Realtime: TEAM_BANNED（BANNED の場合のみ）
```

**★確定した試合には触れない。** 勝敗もレートも変更しない（ADR-033 ①）。

**★BAN処理を重複実装しない。** `admin-ban-team` の処理を `_shared` へ切り出して共用する。
BANは待機列からの削除と進行中の試合の扱いを伴うため、二箇所に書くと必ずずれる（ADR-021 と同じ方針）。

**★単発の通報で措置しない**（ADR-033 ④）。判断は異なるチームからの累積に基づく。
この判断は管理者が画面上で行うものであり、Function は与えられた `resolution` を実行するだけである。

---

# 16. Realtime通知の送信契機

イベント名の正本は `04_BackendInterface.md` 7章である。本表は送信契機のみを示す。

| イベント                    | 送信元Function                                   |
| ----------------------- | --------------------------------------------- |
| MATCH_CREATED           | matchmaker（queue-match からの同期実行を含む）             |
| WINNER_REPORTED         | report-match                                  |
| MATCH_COUNTER_CLAIMED   | report-match（WINNER_REPORTED への呼び出し）          |
| MATCH_EXTENDED          | extend-match-deadline                         |
| MATCH_NO_CONTEST_REQUESTED | request-no-contest                         |
| MATCH_NO_CONTEST_DECLINED  | respond-no-contest（対戦継続）                    |
| MATCH_DRAWN             | respond-no-contest（承諾）、auto-resolve-matches（期限切れ・無応答・競合）、admin-void-match |
| MATCH_COMPLETED         | concede-match、approve-match、auto-resolve-matches（自動承認） |
| RANKING_UPDATED         | concede-match、approve-match、auto-resolve-matches、finalize-season、admin-purge-season-data |
| TEAM_UPDATED            | admin-ban-team、admin-unban-team               |
| TEAM_MEMBER_UPDATED     | accept-team-invite、leave-team、transfer-leader  |
| SYSTEM_SETTINGS_UPDATED | admin-update-system-settings                  |

`MATCH_STARTED` は存在しない（ADR-008）。

---

# 17. AI実装ルール

* 更新処理はEdge FunctionsからDB直結で行い、明示的にトランザクションを制御する。
* DB直結はRLSを迂回するため、Edge Function内で認可を必ず確認する。
* Realtime通知はCOMMIT成功後に送信する。通知失敗でロールバックしない。
* レート更新は承認時（手動・自動）のみ実施する。申告時には行わない。
* `DRAWN` ではレートを更新せず、`rating_history` を作成しない。
* 拒否により `PLAYING` へ戻す際は `report_deadline_at` を必ず再設定する。
* すべてのエラーは `06_ErrorCode.md` のコードを返却する。
* すべてのレスポンスは `result` を含む共通形式に従う。
* 状態遷移は `03_Database.md` 7.1 の遷移表以外を実装してはならない。
* RESTパスを実装してはならない。Edge Function名で呼び出す。

**`MATCH_REJECTED` は廃止した**（ADR-032 ②）。通報（15章）は Realtime を送らない。
