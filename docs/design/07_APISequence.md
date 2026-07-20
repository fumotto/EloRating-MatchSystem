# 07_APISequence.md

# API Sequence Specification

---

# 1. 目的

本書は、各APIの実行シーケンスを定義する。

対象は以下とする。

* Steam Login
* Team
* Team Invite
* Match Queue
* Match
* Rating Update
* Ranking
* Administration

本書は、Supabase Edge Functions・Realtime・RLS・PostgreSQLトランザクションを前提とする。

---

# 2. 共通処理フロー

すべてのEdge Functionは以下の共通フローに従う。

1. HTTPリクエスト受信
2. JWT検証
3. 入力バリデーション
4. RLS・権限確認
5. ビジネスロジック実行
6. 必要に応じてトランザクション開始
7. データ更新
8. トランザクション終了（Commit / Rollback）
9. Realtime通知（必要な場合）
10. レスポンス返却

---

# 3. Steam Login

## シーケンス

1. Steam OAuth認証を実施する。
2. Supabase Authへログインする。
3. `profiles` を検索する。
4. 存在しない場合はプロフィールを作成する。
5. JWTを返却する。

---

# 4. Team作成

## API

`POST /teams`

## シーケンス

1. JWTを検証する。
2. ユーザーが未所属であることを確認する。
3. チーム名の重複を確認する。
4. トランザクション開始。
5. `teams` を作成する。
6. `team_members` に Leader を登録する。
7. Commit。
8. チーム情報を返却する。

Rollback条件

* チーム名重複
* DBエラー
* Leader登録失敗

---

# 5. Team招待

## 招待作成

1. Leader権限確認
2. 人数上限確認
3. 招待レコード作成
4. 招待コード返却

## 招待参加

1. JWT確認
2. 招待有効期限確認
3. 使用済み確認
4. トランザクション開始
5. team_members追加
6. invite更新
7. Commit

---

# 6. Queue登録

## API

`POST /queue`

## シーケンス

1. JWT確認
2. Team状態確認
3. BAN確認
4. 試合中確認
5. Queue登録
6. Matchmaking開始

---

# 7. Matchmaking

## シーケンス

1. Queue一覧取得
2. レート差400以内抽出
3. 待機時間順に並べる
4. Team ID昇順で決定する
5. トランザクション開始
6. Match生成
7. Queue削除
8. Team状態更新
9. Commit
10. MATCH_FOUND通知

Rollback条件

* Match生成失敗
* Queue削除失敗
* Team更新失敗

---

# 8. 勝者報告

## API

`POST /matches/report`

## シーケンス

1. JWT確認
2. 勝者チーム確認
3. Match状態確認
4. WINNER_REPORTED更新
5. 敗者へ通知
6. レスポンス返却

レート更新は行わない。

---

# 9. 敗者承認

## API

`POST /matches/approve`

## シーケンス

1. JWT確認
2. 敗者確認
3. Match状態確認
4. トランザクション開始
5. Elo計算
6. Team Rating更新
7. Rating History追加
8. completed_at更新
9. Match状態更新
10. Team状態更新
11. Commit
12. MATCH_COMPLETED通知

Rollback条件

* Rating更新失敗
* History更新失敗
* Match更新失敗

---

# 10. Ranking

## API

`GET /rankings`

## シーケンス

1. Ranking取得
2. Rating降順ソート
3. レスポンス生成
4. 返却

---

# 11. 管理機能

## Team BAN

1. 管理者確認
2. Team取得
3. BANNED更新
4. Audit Log記録
5. Commit

---

## K値変更

1. 管理者確認
2. 設定更新
3. Audit Log記録
4. Commit

---

## レートリセット

1. 管理者確認
2. トランザクション開始
3. 全Team Rating更新
4. Audit Log追加
5. Commit

---

# 12. Realtime通知

| イベント                   | 送信タイミング  |
| ---------------------- | -------- |
| MATCH_FOUND            | マッチ生成後   |
| MATCH_COMPLETED        | 試合終了後    |
| TEAM_UPDATED           | チーム情報更新後 |
| TEAM_INVITE_CREATED    | 招待作成後    |
| TEAM_INVITE_ACCEPTED   | 招待受諾後    |
| SYSTEM_SETTING_CHANGED | 管理設定変更後  |

---

# 13. AI実装ルール

* 更新処理は必要に応じてトランザクションで実行する。
* RLSを前提とし、Edge Functionでも権限を二重に確認する。
* Realtime通知はCommit成功後に送信する。
* レート更新は敗者承認時のみ実施する。
* すべてのAPIは `06_ErrorCode.md` のエラーコードを返却する。
* すべてのレスポンスは `result` を含む共通フォーマットに従う。
