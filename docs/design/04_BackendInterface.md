# 04_BackendInterface.md

# Backend Interface Specification

Version 1.0

---

# 1. 目的

本書は、フロントエンド（GitHub Pages）と Supabase Backend のインターフェース仕様を定義する。

本システムでは一般的な REST API は提供しない。

以下3種類のインターフェースを利用する。

* Supabase Query
* Supabase Edge Functions
* Supabase Realtime

本書は AI コーディングエージェントがそのまま実装できる粒度で記述する。

---

# 2. アーキテクチャ

```text
Browser

↓

Supabase Auth

↓

RLS

↓

PostgreSQL

↑

Edge Functions

↓

Realtime
```

基本方針

* CRUDはQuery
* 業務ロジックはEdge Functions
* Push通知はRealtime

---

# 3. Backend責務

## Query

用途

データ取得

例

* ランキング
* 試合一覧
* チーム情報

更新処理は禁止しないが、複雑な更新は禁止する。

---

## Edge Functions

用途

ビジネスロジック

例

* チーム作成
* マッチング
* 勝利申告
* 敗者承認
* レート更新

---

## Realtime

用途

イベント通知

例

* マッチ成立
* 試合開始
* 試合終了
* ランキング更新

---

# 4. 認証

認証は

Supabase Auth

Steam OAuth

を利用する。

JWTを利用して認証する。

---

認証が必要なFunction

* create-team
* join-team
* leave-team
* queue-match
* report-match
* approve-match

---

# 5. 共通レスポンス

## Success

```json
{
  "success": true,
  "data": {}
}
```

---

## Error

```json
{
  "success": false,
  "error": {
    "code": "TEAM_NOT_FOUND",
    "message": "Team not found."
  }
}
```

---

# 6. 共通エラーコード

| Code                    | 説明       |
| ----------------------- | -------- |
| UNAUTHORIZED            | 未認証      |
| FORBIDDEN               | 権限なし     |
| VALIDATION_ERROR        | 入力エラー    |
| TEAM_NOT_FOUND          | チームなし    |
| MATCH_NOT_FOUND         | 試合なし     |
| PROFILE_NOT_FOUND       | プロフィールなし |
| ALREADY_IN_TEAM         | 既に所属     |
| TEAM_FULL               | チーム満員    |
| TEAM_BANNED             | BAN済み    |
| MATCH_ALREADY_COMPLETED | 試合終了済み   |
| INVALID_MATCH_STATE     | 状態異常     |
| CONFLICT                | 楽観ロック失敗  |
| INTERNAL_ERROR          | 内部エラー    |

---

# 7. 共通DTO

## TeamSummary

```typescript
{
    id: string;
    name: string;
    rating: number;
}
```

---

## ProfileSummary

```typescript
{
    id: string;
    displayName: string;
    avatarUrl?: string;
}
```

---

## MatchSummary

```typescript
{
    id: string;
    status: string;
    teamA: TeamSummary;
    teamB: TeamSummary;
}
```

---

# 8. Realtimeイベント

チャンネル

```text
match
```

イベント

```text
MATCH_CREATED

MATCH_STARTED

WINNER_REPORTED

MATCH_COMPLETED
```

---

チャンネル

```text
ranking
```

イベント

```text
RANKING_UPDATED
```

---

# 9. Edge Function設計テンプレート

すべての Edge Function は以下の構成で設計する。

---

Function Name

---

Purpose

---

Authentication

---

Authorization

---

Input DTO

---

Output DTO

---

Validation

---

Processing Flow

---

Transaction

---

Updated Tables

---

Realtime Events

---

Error Codes

---

Audit Log

---

Test Cases

---

Future Extensions

---

# 10. Query設計テンプレート

Query Interface は以下を定義する。

対象

* テーブル
* View

取得条件

並び順

ページング

RLS

返却DTO

インデックス利用

---

# 11. 実装ルール

クライアントは

* SQLを書かない
* RPCを直接呼ばない
* UPDATEを乱用しない

複雑な更新は必ずEdge Functionsを利用する。

---

# 12. AI実装ルール

AI実装時は以下を厳守する。

* DTOを変更しない
* Edge Function内でトランザクションを管理する
* RLSを回避しない
* エラーコードを統一する
* Realtimeイベントを必ず送信する
* 楽観ロックを利用する
* ビジネスロジックをクライアントへ実装しない

# 04_BackendInterface.md

## Part2

# Team Management Edge Functions

---

# Function: create-team

## Purpose

新しい固定チームを作成する。

チーム作成者は自動的に OWNER として登録される。

---

## Authentication

必須（Supabase Auth）

---

## Authorization

認証済みユーザー

---

## Input DTO

```typescript
interface CreateTeamRequest {
    name: string;
}
```

---

## Output DTO

```typescript
interface CreateTeamResponse {
    teamId: string;
}
```

---

## Validation

* チーム名：1〜30文字
* チーム名は一意
* BANユーザーは作成不可
* 既にチーム所属中の場合は作成不可

---

## Processing Flow

```text
入力チェック
    ↓
profiles取得
    ↓
所属確認
    ↓
teams作成
    ↓
team_members追加(role=OWNER)
    ↓
Response
```

---

## Transaction

```text
BEGIN

teams INSERT

↓

team_members INSERT

COMMIT
```

---

## Updated Tables

* teams
* team_members

---

## Realtime

なし

---

## Error Codes

* UNAUTHORIZED
* ALREADY_IN_TEAM
* VALIDATION_ERROR
* TEAM_NAME_ALREADY_EXISTS
* INTERNAL_ERROR

---

## Test Cases

* 正常作成
* チーム名重複
* 所属済み
* BANユーザー

---

# Function: create-team-invite

## Purpose

チーム招待を発行する。

招待URLを生成する。

---

## Authentication

必須

---

## Authorization

チームOWNER

---

## Input DTO

```typescript
interface CreateTeamInviteRequest {
    teamId: string;
}
```

---

## Output DTO

```typescript
interface CreateTeamInviteResponse {
    inviteCode: string;
    expiresAt: string;
}
```

---

## Validation

* OWNERのみ
* BANチーム不可
* チーム人数上限未満
* 有効な招待が既に存在する場合は再利用

---

## Processing Flow

```text
OWNER確認
    ↓
人数確認
    ↓
既存招待確認
    ↓
無ければ新規作成
```

---

## Transaction

不要

---

## Updated Tables

* team_invites

---

## Realtime

なし

---

## Error Codes

* FORBIDDEN
* TEAM_FULL
* TEAM_BANNED

---

## Test Cases

* 新規招待
* 招待再利用
* 非OWNER
* 満員

---

# Function: accept-team-invite

## Purpose

招待コードを利用してチームへ参加する。

---

## Authentication

必須

---

## Authorization

認証済み

---

## Input DTO

```typescript
interface AcceptTeamInviteRequest {
    inviteCode: string;
}
```

---

## Output DTO

```typescript
interface AcceptTeamInviteResponse {
    teamId: string;
}
```

---

## Validation

* 招待有効期限
* 招待存在
* チーム人数
* 所属済みでない
* BANチーム不可

---

## Processing Flow

```text
招待取得
    ↓
期限確認
    ↓
人数確認
    ↓
所属確認
    ↓
team_members追加
```

---

## Transaction

```text
BEGIN

人数再確認

↓

team_members INSERT

COMMIT
```

---

## Updated Tables

* team_members

---

## Realtime

なし

---

## Error Codes

* INVITE_NOT_FOUND
* INVITE_EXPIRED
* TEAM_FULL
* ALREADY_IN_TEAM

---

## Test Cases

* 正常参加
* 招待期限切れ
* チーム満員
* 所属済み

---

# Function: leave-team

## Purpose

チームから脱退する。

---

## Authentication

必須

---

## Authorization

チームメンバー

---

## Input DTO

```typescript
interface LeaveTeamRequest {}
```

---

## Output DTO

```typescript
interface LeaveTeamResponse {
    success: true;
}
```

---

## Validation

* 試合中は脱退不可
* OWNER単独では脱退不可

---

## Processing Flow

```text
所属確認
    ↓
試合確認
    ↓
team_members削除
```

---

## Transaction

```text
BEGIN

team_members DELETE

COMMIT
```

---

## Updated Tables

* team_members

---

## Error Codes

* MATCH_IN_PROGRESS
* OWNER_TRANSFER_REQUIRED
* NOT_TEAM_MEMBER

---

## Test Cases

* 通常脱退
* 試合中
* OWNER単独
* 非所属

---

# Function: transfer-owner

## Purpose

OWNER権限を他メンバーへ譲渡する。

---

## Authentication

必須

---

## Authorization

現OWNERのみ

---

## Input DTO

```typescript
interface TransferOwnerRequest {
    teamId: string;
    newOwnerProfileId: string;
}
```

---

## Output DTO

```typescript
interface TransferOwnerResponse {
    success: true;
}
```

---

## Validation

* 現OWNERのみ
* 譲渡先が同チーム所属
* 自分自身への譲渡不可

---

## Processing Flow

```text
OWNER確認
    ↓
対象確認
    ↓
role更新
```

---

## Transaction

```text
BEGIN

旧OWNER → MEMBER

↓

新OWNER → OWNER

COMMIT
```

---

## Updated Tables

* team_members

---

## Realtime

なし

---

## Error Codes

* FORBIDDEN
* MEMBER_NOT_FOUND
* INVALID_OWNER_TRANSFER

---

## Test Cases

* 正常譲渡
* 非OWNER
* 存在しないメンバー
* 自己譲渡

# 04_BackendInterface.md

## Part3

# Match Management Edge Functions

---

# Function: queue-match

## Purpose

チームをマッチング待機キューへ登録する。

---

## Authentication

必須（Supabase Auth）

---

## Authorization

チームOWNERのみ

---

## Input DTO

```typescript
interface QueueMatchRequest {
    teamId: string;
}
```

---

## Output DTO

```typescript
interface QueueMatchResponse {
    queuedAt: string;
}
```

---

## Validation

* チームが存在すること
* チームがBANされていないこと
* 呼び出しユーザーがOWNERであること
* 試合中ではないこと
* 既にキュー登録済みでないこと

---

## Processing Flow

```text
認証
    ↓
チーム取得
    ↓
OWNER確認
    ↓
試合状態確認
    ↓
matching_queue登録
```

---

## Transaction

```text
BEGIN

matching_queue INSERT

COMMIT
```

---

## Updated Tables

* matching_queue

---

## Realtime

なし

---

## Error Codes

* TEAM_NOT_FOUND
* TEAM_BANNED
* FORBIDDEN
* MATCH_IN_PROGRESS
* ALREADY_IN_QUEUE

---

## Test Cases

* 正常登録
* BANチーム
* OWNER以外
* 重複登録
* 試合中

---

# Function: cancel-match-queue

## Purpose

マッチング待機をキャンセルする。

---

## Authentication

必須

---

## Authorization

チームOWNER

---

## Input DTO

```typescript
interface CancelQueueRequest {
    teamId: string;
}
```

---

## Output DTO

```typescript
interface CancelQueueResponse {
    success: true;
}
```

---

## Validation

* 待機中であること
* OWNERであること

---

## Processing Flow

```text
matching_queue検索
    ↓
DELETE
```

---

## Transaction

```text
BEGIN

DELETE matching_queue

COMMIT
```

---

## Updated Tables

* matching_queue

---

## Realtime

なし

---

## Error Codes

* NOT_IN_QUEUE
* FORBIDDEN

---

## Test Cases

* 正常キャンセル
* キュー未登録
* OWNER以外

---

# Function: report-match

## Purpose

勝者チームが試合結果を申告する。

---

## Authentication

必須

---

## Authorization

勝者チームのメンバー

---

## Input DTO

```typescript
interface ReportMatchRequest {
    matchId: string;
    winnerTeamId: string;
}
```

---

## Output DTO

```typescript
interface ReportMatchResponse {
    status: "WINNER_REPORTED";
}
```

---

## Validation

* 試合が存在すること
* 試合状態がPLAYINGであること
* winnerTeamIdが参加チームであること
* 呼び出しユーザーが勝者チーム所属であること

---

## Processing Flow

```text
試合取得
    ↓
状態確認
    ↓
勝者確認
    ↓
reported_by設定
    ↓
status更新
```

---

## Transaction

```text
BEGIN

matches UPDATE

COMMIT
```

---

## Updated Tables

* matches

---

## Realtime

```text
WINNER_REPORTED
```

---

## Error Codes

* MATCH_NOT_FOUND
* INVALID_MATCH_STATE
* FORBIDDEN

---

## Test Cases

* 正常申告
* 試合終了済み
* 参加外チーム
* 敗者側から申告

---

# Function: approve-match

## Purpose

敗者チームが試合結果を承認し、レート更新を実行する。

---

## Authentication

必須

---

## Authorization

敗者チームのメンバー

---

## Input DTO

```typescript
interface ApproveMatchRequest {
    matchId: string;
}
```

---

## Output DTO

```typescript
interface ApproveMatchResponse {
    completedAt: string;
    ratingA: number;
    ratingB: number;
}
```

---

## Validation

* 試合状態がWINNER_REPORTEDであること
* 呼び出しユーザーが敗者チーム所属であること
* 楽観ロック(version)が一致すること

---

## Processing Flow

```text
試合取得
    ↓
状態確認
    ↓
敗者確認
    ↓
Elo計算
    ↓
rating_history登録
    ↓
teams.rating更新
    ↓
completed_at設定
    ↓
status=COMPLETED
```

---

## Transaction

```text
BEGIN

matches UPDATE

↓

rating_history INSERT ×2

↓

teams UPDATE ×2

COMMIT
```

---

## Updated Tables

* matches
* rating_history
* teams

---

## Realtime

```text
MATCH_COMPLETED

RANKING_UPDATED
```

---

## Error Codes

* MATCH_NOT_FOUND
* INVALID_MATCH_STATE
* FORBIDDEN
* CONFLICT

---

## Test Cases

* 正常承認
* 二重承認
* version競合
* 敗者以外
* 状態異常

---

# Function: matchmaker

## Purpose

待機中チームから対戦カードを生成する。

システム内部処理専用。

クライアントからは呼び出さない。

---

## Trigger

* Cron
* Queue追加時
* 将来的にRealtime Hook対応

---

## Authentication

Service Role

---

## Authorization

なし（内部処理）

---

## Input DTO

なし

---

## Output DTO

```typescript
interface MatchmakerResult {
    matchedCount: number;
}
```

---

## Validation

* BANチーム除外
* 同一チーム除外
* 試合中チーム除外

---

## Processing Flow

```text
待機チーム取得
    ↓
マッチ候補検索
    ↓
レート差判定
    ↓
matches作成
    ↓
matching_queue削除
```

---

## Transaction

```text
BEGIN

matches INSERT

↓

matching_queue DELETE ×2

COMMIT
```

---

## Updated Tables

* matches
* matching_queue

---

## Realtime

```text
MATCH_CREATED
```

---

## Error Codes

内部エラーのみ

---

## Test Cases

* 通常マッチ
* 奇数チーム
* BANチーム
* 同一チーム
* レート差過大

# 04_BackendInterface.md

## Part4

# Query Interfaces

本章では読み取り専用インターフェースを定義する。

データ取得は Supabase Query を利用する。

クライアントは可能な限り View を参照し、複雑な JOIN や集計処理を実装しない。

---

# Query: Ranking

## Source

team_ranking_view

---

## Purpose

ランキング画面を表示する。

---

## Filter

なし

---

## Sort

1.

rating DESC

2.

wins DESC

3.

team_name ASC

---

## Pagination

Limit / Offset

デフォルト

50件

---

## Response DTO

```typescript
interface RankingItem {

    teamId: string;

    teamName: string;

    rating: number;

    wins: number;

    losses: number;

    matches: number;

    winRate: number;
}
```

---

## RLS

認証済みユーザー

---

## Index

IX_rating_history_completed

IX_teams_rating

---

## Realtime

RANKING_UPDATED

---

# Query: Team Detail

## Source

team_detail_view

---

## Purpose

チーム詳細画面

---

## Parameter

teamId

---

## Response DTO

```typescript
interface TeamDetail {

    teamId: string;

    teamName: string;

    rating: number;

    members: ProfileSummary[];

    ownerId: string;

    isBanned: boolean;
}
```

---

## RLS

認証済み

---

## Realtime

TEAM_UPDATED

---

# Query: My Team

## Source

team_detail_view

---

## Purpose

自分が所属するチーム取得

---

## Filter

profileId

JWTから取得

---

## Response

TeamDetail

---

## RLS

本人のみ

---

# Query: Match List

## Source

match_list_view

---

## Purpose

試合一覧

---

## Filter

status

任意

---

teamId

任意

---

## Sort

created_at DESC

---

## Pagination

Limit / Offset

---

## Response DTO

```typescript
interface MatchListItem {

    id: string;

    teamA: TeamSummary;

    teamB: TeamSummary;

    winnerTeamId?: string;

    status: string;

    startedAt?: string;

    completedAt?: string;
}
```

---

## Realtime

MATCH_CREATED

MATCH_COMPLETED

---

# Query: Match Detail

## Source

match_detail_view

---

## Purpose

試合詳細

---

## Parameter

matchId

---

## Response DTO

```typescript
interface MatchDetail {

    id: string;

    teamA: TeamSummary;

    teamB: TeamSummary;

    winnerTeamId?: string;

    reportedBy?: ProfileSummary;

    approvedBy?: ProfileSummary;

    status: string;

    startedAt?: string;

    finishedAt?: string;

    completedAt?: string;
}
```

---

# Query: Match History

## Source

match_list_view

---

## Purpose

チーム戦績

---

## Filter

teamId

---

status=COMPLETED

---

## Sort

completed_at DESC

---

# Query: Profile

## Source

profiles

---

## Purpose

ログインユーザー取得

---

## Filter

JWT User ID

---

## Response DTO

```typescript
interface Profile {

    id: string;

    displayName: string;

    avatarUrl?: string;

    steamId: string;
}
```

---

# Query: Queue Status

## Source

matching_queue

---

## Purpose

待機状態表示

---

## Filter

teamId

---

## Response DTO

```typescript
interface QueueStatus {

    queued: boolean;

    queuedAt?: string;
}
```

---

# Realtime Subscription

---

## Ranking

Channel

ranking

Event

RANKING_UPDATED

更新内容

ランキング再取得

---

## Match

Channel

match

Events

MATCH_CREATED

MATCH_STARTED

WINNER_REPORTED

MATCH_COMPLETED

---

更新内容

Match Detail再取得

---

## Team

Channel

team

Events

TEAM_UPDATED

TEAM_MEMBER_UPDATED

---

更新内容

Team Detail再取得

---

# 共通ルール

取得処理は読み取り専用とする。

クライアントから View を更新しない。

JOIN は View 側へ集約する。

DTO を変更する場合は Version を更新する。

ページングは Limit / Offset を利用する。

ソートは View 側の Index を利用できるもののみ許可する。

キャッシュ可能なデータは Supabase Client Cache を利用する。


# 04_BackendInterface.md

## Part5

# Admin & System Edge Functions

---

# 概要

本章では管理者専用およびシステム内部で利用する Edge Functions を定義する。

管理者機能は一般プレイヤーから利用できない。

認可は Supabase JWT と管理者ロールで制御する。

---

# Function: admin-ban-team

## Purpose

チームをBANする。

BAN後は以下を禁止する。

* マッチング参加
* 招待発行
* 試合結果登録

---

## Authentication

必須

---

## Authorization

管理者

---

## Input DTO

```typescript
interface AdminBanTeamRequest {
    teamId: string;
    reason: string;
}
```

---

## Output DTO

```typescript
interface AdminBanTeamResponse {
    success: true;
}
```

---

## Validation

* teamId が存在する
* reason は1〜500文字

---

## Processing Flow

```text
チーム取得
    ↓
BAN設定
    ↓
待機キュー削除
```

---

## Transaction

```text
BEGIN

teams UPDATE

↓

matching_queue DELETE

COMMIT
```

---

## Updated Tables

* teams
* matching_queue

---

## Realtime

TEAM_UPDATED

---

## Error Codes

* TEAM_NOT_FOUND
* FORBIDDEN

---

# Function: admin-unban-team

## Purpose

チームBANを解除する。

---

## Authentication

必須

---

## Authorization

管理者

---

## Input DTO

```typescript
interface AdminUnbanTeamRequest {
    teamId: string;
}
```

---

## Output DTO

```typescript
interface AdminUnbanTeamResponse {
    success: true;
}
```

---

## Updated Tables

* teams

---

## Realtime

TEAM_UPDATED

---

# Function: admin-update-system-settings

## Purpose

システム設定を変更する。

---

## Authentication

必須

---

## Authorization

管理者

---

## Input DTO

```typescript
interface UpdateSystemSettingsRequest {

    ratingK?: number;

    teamMaxMembers?: number;

    inviteExpirationHours?: number;
}
```

---

## Output DTO

```typescript
interface UpdateSystemSettingsResponse {
    success: true;
}
```

---

## Validation

各設定値は Database の Check 制約に従う。

---

## Updated Tables

* system_settings

---

## Realtime

SYSTEM_SETTINGS_UPDATED

---

# Function: admin-start-new-season

## Purpose

全チームのレーティングを初期値へ戻す。

---

## Authentication

必須

---

## Authorization

管理者

---

## Input DTO

```typescript
interface ResetRatingRequest {

    initialRating: number;
}
```

---

## Output DTO

```typescript
interface ResetRatingResponse {

    success: true;
}
```

---

## Transaction

```text
BEGIN

teams UPDATE

↓

rating_history INSERT

COMMIT
```

---

## Updated Tables

* teams

* rating_history

---

## Realtime

RANKING_UPDATED

---

# Internal Function: cleanup-expired-invites

## Purpose

期限切れ招待を失効状態へ更新する。

---

## Trigger

Cron

1時間毎

---

## Authentication

Service Role

---

## Updated Tables

* team_invites

---

# Internal Function: cleanup-matching-queue

## Purpose

異常終了した待機情報を削除する。

---

## Trigger

Cron

10分毎

---

## Updated Tables

* matching_queue

---

# Backend Responsibility Matrix

| 機能       | Query | Edge Function | Realtime |
| -------- | ----- | ------------- | -------- |
| ランキング取得  | ○     |               | ○        |
| プロフィール取得 | ○     |               |          |
| チーム作成    |       | ○             |          |
| 招待発行     |       | ○             |          |
| 招待参加     |       | ○             |          |
| キュー登録    |       | ○             |          |
| 勝利申告     |       | ○             | ○        |
| 敗者承認     |       | ○             | ○        |
| ランキング更新  |       |               | ○        |
| 管理者設定    |       | ○             | ○        |

---

# エラーハンドリング方針

エラーは以下の3種類に分類する。

## Validation Error

入力不正。

HTTP 400。

---

## Authorization Error

認証・権限エラー。

HTTP 401 / 403。

---

## Business Error

業務ルール違反。

例

* TEAM_FULL
* MATCH_IN_PROGRESS
* ALREADY_IN_TEAM

HTTP 409。

---

## Internal Error

想定外。

HTTP 500。

ログへ記録する。

---

# ログ出力方針

Edge Functions は必ず以下を出力する。

* Function Name
* User ID
* Team ID
* Match ID
* Execution Time
* Result
* Error Code

個人情報やアクセストークンはログへ出力しない。

---

# AI実装ガイドライン

実装時は以下を厳守する。

* Query は読み取り専用とする。
* 更新処理は Edge Functions に集約する。
* すべての更新処理はトランザクションで実行する。
* DTO の破壊的変更は禁止する。
* Realtime イベントは更新完了後に送信する。
* RLS を回避する SQL は実装しない。
* Service Role は内部処理のみに使用する。
* エラーコードは共通定義を利用する。
* 楽観ロック（version）を利用して同時更新を防止する。

---

# Backend Interface 完了

本書に定義した Query、Edge Functions、Realtime をバックエンドの唯一の公開インターフェースとする。

フロントエンドは本書で定義した DTO のみを利用し、データベース構造へ直接依存しない。

新しい機能を追加する場合は、本書へ Use Case を追加してから実装を開始する。
