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

# 11. 拒否

## Function

`reject-match`

## シーケンス

```text
1. JWT検証
2. BEGIN
3. 試合取得
4. 状態確認（WINNER_REPORTED であること）
5. 呼び出しユーザーが敗者チームに所属していることを確認
6. system_settings から max_reject_count・report_timeout_minutes を取得
7. reject_count + 1 を算出
8-A. 上限に達した場合
     status = 'DRAWN'
     completed_at = now()
     reject_count = reject_count + 1
     → レート更新・rating_history 作成は行わない
     → audit_logs（MATCH_DRAWN）
     → Realtime: MATCH_DRAWN
8-B. 上限未満の場合
     status = 'PLAYING'
     winner_team_id = NULL
     reported_by_profile_id = NULL
     reported_at = NULL
     approve_deadline_at = NULL
     reject_count = reject_count + 1
     report_deadline_at = now() + report_timeout_minutes  ← 再設定が必須
     → audit_logs（MATCH_REJECTED）
     → Realtime: MATCH_REJECTED
9. COMMIT
```

**手順8-Bにおける `report_deadline_at` の再設定は必須である。**

再設定しない場合、当初の申告期限を既に過ぎていると、`PLAYING` へ戻した直後に自動解決バッチがドロー解散させてしまう。

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

## 14.4 レートリセット

### Function

`admin-reset-ratings`

```text
1. JWT検証
2. BEGIN
3. 管理者確認
4. 進行中試合が存在しないことを確認（存在する場合は RATING-003）
5. teams UPDATE（rating = initialRating）
6. audit_logs INSERT（RATING_RESET、対象件数とリセット前の値を payload へ）
7. COMMIT
8. Realtime: RANKING_UPDATED
```

`rating_history` へは登録しない。`match_id` が NOT NULL かつ `matches` への外部キーであるため、試合に紐づかない履歴を登録できないためである（ADR-017）。

リセットの記録は `audit_logs` が担う。過去の `rating_history` は削除しない。

---

# 15. Realtime通知の送信契機

イベント名の正本は `04_BackendInterface.md` 7章である。本表は送信契機のみを示す。

| イベント                    | 送信元Function                                   |
| ----------------------- | --------------------------------------------- |
| MATCH_CREATED           | matchmaker（queue-match からの同期実行を含む）             |
| WINNER_REPORTED         | report-match                                  |
| MATCH_REJECTED          | reject-match（PLAYINGへ戻した場合）                   |
| MATCH_DRAWN             | reject-match（上限到達）、auto-resolve-matches（報告期限切れ） |
| MATCH_COMPLETED         | approve-match、auto-resolve-matches（自動承認）       |
| RANKING_UPDATED         | approve-match、auto-resolve-matches、admin-reset-ratings |
| TEAM_UPDATED            | admin-ban-team、admin-unban-team               |
| TEAM_MEMBER_UPDATED     | accept-team-invite、leave-team、transfer-leader  |
| SYSTEM_SETTINGS_UPDATED | admin-update-system-settings                  |

`MATCH_STARTED` は存在しない（ADR-008）。

---

# 16. AI実装ルール

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
