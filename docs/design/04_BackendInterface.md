# 04_BackendInterface.md

# Backend Interface Specification

Version: 2.0
Status: Active
Last Updated: 2026-08-03
準拠ADR: ADR-002, ADR-003, ADR-005, ADR-007, ADR-008, ADR-009, ADR-010, ADR-013, ADR-014, ADR-015, ADR-016, ADR-017, ADR-018

---

# 1. 目的

本書は、フロントエンド（GitHub Pages）と Supabase Backend のインターフェース仕様を定義する。

本システムは一般的な REST API を提供しない。以下3種類のインターフェースを利用する。

* Supabase Query（読み取り専用）
* Supabase Edge Functions（更新系すべて）
* Supabase Realtime（イベント通知）

本書は以下の正本である（`ReferenceIndex.md` 参照）。

* Edge Function の定義
* Query の定義
* DTO
* Realtime イベント一覧

エラーコードおよびレスポンス形式の正本は `06_ErrorCode.md` である。

---

# 2. アーキテクチャ

```text
Browser
  │
  ├── 読み取り ──→ Supabase Client SDK ──→ PostgREST ──→ RLS ──→ PostgreSQL
  │
  ├── 更新 ──────→ Edge Functions ──────→ 直接接続 ────────────→ PostgreSQL
  │                    （認可チェックを内部で実施）
  │
  └── 購読 ──────→ Realtime
```

基本方針

* 読み取りは Query（RLSで保護）
* 更新は Edge Functions（トランザクション制御が必要なため）
* 通知は Realtime

---

## 2.1 更新系の実装方式

ADR-016により、Edge Functions は PostgreSQL へ直接接続し、TypeScript内で明示的にトランザクションを制御する。

```typescript
// 概念コード
const tx = await pool.connect();
try {
  await tx.query("BEGIN");
  // 認可チェック（RLSを迂回するため必須）
  // 業務ロジック
  await tx.query("COMMIT");
} catch (e) {
  await tx.query("ROLLBACK");
  throw e;
} finally {
  tx.release();
}
```

重要な制約。

* Supabase JavaScript SDK（PostgREST経由）は複数ステートメントにまたがるトランザクションを開始できない。更新系処理でSDKを使用してはならない。
* 直接接続はRLSを迂回する。**Edge Function内での認可チェックは必須**である。
* 接続は Connection Pooler 経由とし、環境変数 `APP_DB_POOL_URL` を使用する（`11_Deployment.md` 4.2・5.1）。`SUPABASE_DB_URL` は Supabase が自動注入する直接接続であり、予約接頭辞のため上書きできない。ローカルと CI のみ、そちらへ退避する。
* Transaction mode の Pooler では prepared statement に制約があるため、接続設定で無効化する。

---

# 3. Backend責務

| 種別             | 用途       | 例                        |
| -------------- | -------- | ------------------------ |
| Query          | データ取得のみ  | ランキング、試合一覧、チーム情報         |
| Edge Functions | 更新系すべて   | チーム作成、マッチング、勝利申告、承認、拒否   |
| Realtime       | イベント通知   | マッチ成立、試合完了、ランキング更新       |

**Query は読み取り専用とする。** Query経由での更新を行ってはならない。

例外として `profiles` の自己更新のみクライアントから直接実行できる（`03_Database.md` 19章）。

---

# 4. 認証

認証は Supabase Auth を利用し、JWTで検証する。

認証プロバイダは ADR-015 により固定しない。`profiles.auth_provider` で識別する。

## 4.1 プロフィールの自動作成

ログイン後、`profiles` にレコードが存在しない場合は作成する。

作成主体は **`ensure-profile` Edge Function** とする。クライアントはログイン完了後に必ず本Functionを呼び出す。

DBトリガによる自動作成は採用しない。プロバイダごとに取得できる属性が異なり、トリガ内で外部情報を扱えないためである。

---

## 4.2 認証が必要なFunction

以下を除くすべてのEdge Functionは認証を必須とする。

| Function              | 認証         |
| --------------------- | ---------- |
| matchmaker            | Service Role |
| auto-resolve-matches  | Service Role |
| cleanup-expired-invites | Service Role |
| cleanup-matching-queue | Service Role |
| finalize-season       | Service Role |

Service Role は内部処理専用であり、クライアントから呼び出してはならない。

---

## 4.3 JWTから取得する情報

Edge Functions はJWTを検証し、以下をクレームから取得する。**リクエストボディの値を信用してはならない。**

| 情報      | 取得元                              | 用途           |
| ------- | -------------------------------- | ------------ |
| 利用者ID   | `sub`                            | 本人確認、所属チームの導出 |
| 認証プロバイダ | `app_metadata.provider`          | プロフィール作成     |
| 管理者ロール  | `app_metadata.role`（`admin` かどうか） | 管理機能の認可      |

`app_metadata` は service_role でのみ更新可能であり、利用者が改ざんできない（ADR-020）。

---

# 5. 共通レスポンス

レスポンス形式の正本は `06_ErrorCode.md` である。本書では概要のみ示す。

## 成功

```json
{
  "result": "OK",
  "data": {}
}
```

## 業務エラー

```json
{
  "result": "NG",
  "error": {
    "code": "TEAM-004",
    "message": "Team is full."
  }
}
```

## システムエラー

```json
{
  "result": "FATAL",
  "error": {
    "code": "SYSTEM-001",
    "message": "Internal server error."
  }
}
```

エラーコードの一覧は `06_ErrorCode.md` を参照する。本書に独自のエラーコード一覧を定義してはならない。

---

# 6. 共通DTO

## TeamSummary

```typescript
interface TeamSummary {
    id: string;
    name: string;
    rating: number;
}
```

## ProfileSummary

```typescript
interface ProfileSummary {
    id: string;
    displayName: string;
    avatarUrl?: string;
}
```

## MatchStatus

```typescript
type MatchStatus = "PLAYING" | "WINNER_REPORTED" | "COMPLETED" | "DRAWN";
```

## TeamRole

```typescript
type TeamRole = "LEADER" | "MEMBER";
```

---

## 6.1 DTOとDBカラムの対応

DTOは camelCase、DBカラムは snake_case とする。変換はEdge FunctionsおよびBackend Client層で行い、UI層へは常にcamelCaseで渡す。

| DTOフィールド      | DBカラム                    |
| ------------- | ------------------------ |
| id            | id                       |
| teamId        | team_id                  |
| teamName      | teams.name               |
| displayName   | profiles.display_name    |
| avatarUrl     | profiles.avatar_url      |
| winnerTeamId  | winner_team_id           |
| reportedBy    | reported_by_profile_id   |
| reportedAt    | reported_at              |
| approvedBy    | approved_by_profile_id   |
| approvedAt    | approved_at              |
| autoApproved  | auto_approved            |
| rejectCount   | reject_count             |
| startedAt     | started_at               |
| completedAt   | completed_at             |
| ratingChange  | rating_change            |
| kValue        | k_value                  |

`finished_at` は存在しない。試合確定日時は `completedAt` を用いる（ADR-002）。

---

# 7. Realtimeイベント一覧

本節をRealtimeイベントの唯一の正本とする。ここに定義のないイベント名を使用してはならない。

実装方式は **Broadcast** とする。Edge Functionsがトランザクションのコミット成功後に明示的に送信する。

Postgres Changes（テーブル変更の自動購読）は使用しない。RLSとの組み合わせが複雑になり、送信タイミングを制御できないためである。

## Channel: `match`

| Event             | 送信契機         | 送信元                            |
| ----------------- | ------------ | ------------------------------ |
| MATCH_CREATED     | マッチ成立        | matchmaker                     |
| WINNER_REPORTED   | 勝利申告         | report-match                   |
| MATCH_COUNTER_CLAIMED | 反対申告      | report-match（WINNER_REPORTED への呼び出し） |
| MATCH_EXTENDED    | 報告期限の延長      | extend-match-deadline          |
| MATCH_NO_CONTEST_REQUESTED | 不成立の申請 | request-no-contest            |
| MATCH_NO_CONTEST_DECLINED  | 対戦継続の宣言 | respond-no-contest            |
| MATCH_COMPLETED   | 試合確定（投了・承認・自動） | concede-match / approve-match / auto-resolve-matches |
| MATCH_DRAWN       | ドロー解散        | respond-no-contest（承諾）/ auto-resolve-matches / admin-void-match |

**`MATCH_REJECTED` は廃止した**（ADR-032 ②）。イベント名を再利用しない。

**通報（20章）は Realtime を送らない。** 通報の発生を誰にも知らせない（ADR-033）。

`MATCH_STARTED` は使用しない。マッチ成立と試合開始が同時であるため `MATCH_CREATED` に統合した（ADR-008）。

## Channel: `ranking`

| Event           | 送信契機          | 送信元                                 |
| --------------- | ------------- | ----------------------------------- |
| RANKING_UPDATED | レート更新後        | approve-match / auto-resolve-matches / finalize-season / admin-purge-season-data |

## Channel: `team`

| Event               | 送信契機            | 送信元                                     |
| ------------------- | --------------- | --------------------------------------- |
| TEAM_UPDATED        | チーム情報の更新・BAN・解除 | admin-ban-team / admin-unban-team       |
| TEAM_MEMBER_UPDATED | メンバー増減・LEADER移譲 | accept-team-invite / leave-team / transfer-leader |

## Channel: `system`

| Event                   | 送信契機   | 送信元                          |
| ----------------------- | ------ | ---------------------------- |
| SYSTEM_SETTINGS_UPDATED | システム設定変更 | admin-update-system-settings |
| SEASON_STATE_CHANGED    | シーズンの状態変化 | admin-end-season / finalize-season / admin-resume-season |

---

# 8. Edge Function設計テンプレート

すべての Edge Function は以下の項目を定義する。

```text
Function Name / Purpose / Authentication / Authorization /
Input DTO / Output DTO / Validation / Processing Flow /
Transaction / Updated Tables / Realtime / Audit Log /
Error Codes / Test Cases
```

---

## 8.1 共通処理の利用

各Edge Functionは、以下を自前で実装せず `supabase/functions/_shared/` から import する（ADR-021）。

| 共通処理     | 定義箇所 | 内容                                    |
| -------- | ---- | ------------------------------------- |
| 共通レスポンス生成 | 5章   | 成功・業務エラー・システムエラーの形式                   |
| JWT検証    | 4.3  | Authorizationヘッダの検証とクレーム取り出し          |
| DB接続とトランザクション | 2.1  | Connection Pooler経由の接続、BEGIN/COMMIT/ROLLBACK |

各Edge Functionが持つのは、そのFunction固有の Validation・Processing Flow・
Input/Output DTO の組み立てに限る。

共通処理は各Edge Functionより先に実装する（`ImplementationRoadmap.md` 5章）。

---

# 9. Team Management Edge Functions

## 9.1 ensure-profile

### Purpose

ログイン済み利用者のプロフィールを取得し、存在しない場合は作成する。

### Authentication / Authorization

必須 / 認証済みユーザー（本人のみ）

### Input DTO

```typescript
interface EnsureProfileRequest {
    displayName: string;
    avatarUrl?: string;
}
```

### Output DTO

```typescript
interface EnsureProfileResponse {
    id: string;
    displayName: string;
    avatarUrl?: string;
    authProvider: string;
}
```

### Validation

* `displayName` は1〜50文字
* `auth_provider` と `provider_user_id` はJWTから取得する（クライアント入力を信頼しない）

### Processing Flow

```text
JWT検証
  ↓
profiles を id で検索
  ↓
存在すれば display_name・avatar_url を同期して返却
  ↓
存在しなければ INSERT して返却
```

### Transaction

単一INSERTまたはUPDATEのため不要。

### Updated Tables

`profiles`

### Realtime / Audit Log

なし / なし

### Error Codes

`AUTH-001`、`VALIDATION-001`、`SYSTEM-001`

### Test Cases

初回作成、再ログイン時の重複作成防止、表示名の同期、不正な表示名

---

## 9.2 create-team

### Purpose

新しい固定チームを作成する。作成者は自動的にLEADERとして登録される。

### Authentication / Authorization

必須 / 認証済みユーザー

### Input DTO

```typescript
interface CreateTeamRequest {
    name: string;
}
```

### Output DTO

```typescript
interface CreateTeamResponse {
    teamId: string;
    name: string;
    rating: number;
}
```

### Validation

* チーム名は1〜30文字
* チーム名は一意
* 既にチームへ所属している場合は作成不可

### Processing Flow

```text
入力チェック
  ↓
所属確認（team_members に自分が存在しないこと）
  ↓
system_settings.initial_rating 取得
  ↓
teams INSERT
  ↓
team_members INSERT（role = 'LEADER'）
  ↓
audit_logs INSERT（TEAM_CREATED）
```

### Transaction

```text
BEGIN → teams INSERT → team_members INSERT → audit_logs INSERT → COMMIT
```

### Updated Tables

`teams`、`team_members`、`audit_logs`

### Realtime / Audit Log

なし / TEAM_CREATED

### Error Codes

`AUTH-001`、`VALIDATION-001`、`VALIDATION-003`、`TEAM-002`、`TEAM-003`、`SYSTEM-001`

### Test Cases

正常作成、チーム名重複、所属済み、名前の最小・最大文字数

---

## 9.3 create-team-invite

### Purpose

チーム招待を発行する。有効な招待が既に存在する場合はそれを返却する。

### Authentication / Authorization

必須 / チームLEADER

### Input DTO

```typescript
interface CreateTeamInviteRequest {
    teamId: string;
}
```

### Output DTO

```typescript
interface CreateTeamInviteResponse {
    inviteCode: string;
    expiresAt: string;
}
```

### Validation

* 呼び出しユーザーが対象チームのLEADERであること
* チームがBANされていないこと
* チーム人数が上限未満であること

### Processing Flow

```text
LEADER確認
  ↓
BAN確認
  ↓
人数確認
  ↓
有効な招待（status='ACTIVE' かつ expires_at > now()）を検索
  ↓
存在すれば … 平文コードは再現できないため、既存招待を REVOKED にして再発行する
  ↓
招待コードを生成（128bit以上のエントロピー）
  ↓
ハッシュ値を team_invites へ INSERT
  ↓
平文コードを応答で返却
```

招待コードはハッシュ化して保存するため平文を再取得できない。「既存招待の再利用」は行わず、再発行時に旧招待を `REVOKED` とする。

### Transaction

```text
BEGIN → 旧招待 UPDATE(REVOKED) → team_invites INSERT → COMMIT
```

### Updated Tables

`team_invites`

### Realtime / Audit Log

なし / なし

### Error Codes

`AUTH-001`、`TEAM-001`、`TEAM-004`、`TEAM-005`、`TEAM-006`、`SYSTEM-001`

### Test Cases

新規発行、再発行時の旧招待失効、非LEADER、満員、BANチーム

---

## 9.4 accept-team-invite

### Purpose

招待コードを利用してチームへ参加する。

### Authentication / Authorization

必須 / 認証済みユーザー

### Input DTO

```typescript
interface AcceptTeamInviteRequest {
    inviteCode: string;
}
```

### Output DTO

```typescript
interface AcceptTeamInviteResponse {
    teamId: string;
    teamName: string;
}
```

### Validation

* 招待が存在すること（ハッシュ値で照合）
* 招待が `ACTIVE` であること
* 有効期限内であること
* チームがBANされていないこと
* チーム人数が上限未満であること（トランザクション内で再確認）
* 呼び出しユーザーが未所属であること

### Processing Flow

```text
inviteCode をハッシュ化して team_invites を検索
  ↓
状態・期限確認
  ↓
BAN確認
  ↓
所属確認
  ↓
人数を再確認（同時参加による定員超過を防ぐ）
  ↓
team_members INSERT
  ↓
team_invites UPDATE（status='USED'、used_at、used_by_profile_id）
```

### Transaction

```text
BEGIN → 人数再確認（FOR UPDATE）→ team_members INSERT → team_invites UPDATE → COMMIT
```

### Updated Tables

`team_members`、`team_invites`

### Realtime / Audit Log

TEAM_MEMBER_UPDATED / なし

### Error Codes

`AUTH-001`、`INVITE-001`、`INVITE-002`、`INVITE-003`、`INVITE-004`、`TEAM-003`、`TEAM-004`、`TEAM-006`、`SYSTEM-001`

### Test Cases

正常参加、期限切れ、使用済み、無効コード、満員、所属済み、同時参加による定員超過の防止

---

## 9.5 leave-team

### Purpose

チームから脱退する。

### Authentication / Authorization

必須 / チームメンバー

### Input DTO

```typescript
interface LeaveTeamRequest {}
```

所属チームはJWTから導出するため入力は不要。

### Output DTO

```typescript
interface LeaveTeamResponse {
    teamId: string;
    remainingMembers: number;
}
```

### Validation

* チームに所属していること
* 進行中の試合が存在しないこと
* LEADERの場合、他メンバーが存在するなら移譲が必要（単独メンバーであれば脱退可能）

### Processing Flow

```text
所属確認
  ↓
進行中試合の確認（matches に終端状態でないレコードが無いこと）
  ↓
LEADER かつ 他メンバーが存在する場合はエラー
  ↓
team_members DELETE
  ↓
待機中であれば matching_queue DELETE
```

最後の1人が脱退した場合、チームはメンバー0人のまま残存する。チーム削除はMVP対象外である。

### Transaction

```text
BEGIN → matching_queue DELETE → team_members DELETE → COMMIT
```

### Updated Tables

`team_members`、`matching_queue`

### Realtime / Audit Log

TEAM_MEMBER_UPDATED / なし

### Error Codes

`AUTH-001`、`TEAM-001`、`TEAM-006`、`TEAM-007`、`TEAM-008`、`TEAM-010`、`SYSTEM-001`

### Test Cases

通常脱退、試合中の脱退拒否、LEADER単独以外での脱退拒否、LEADER単独での脱退、非所属

---

## 9.6 transfer-leader

### Purpose

LEADER権限を他メンバーへ譲渡する。

### Authentication / Authorization

必須 / 現LEADERのみ

### Input DTO

```typescript
interface TransferLeaderRequest {
    newLeaderProfileId: string;
}
```

### Output DTO

```typescript
interface TransferLeaderResponse {
    leaderId: string;
}
```

### Validation

* 呼び出しユーザーが現LEADERであること
* 譲渡先が同一チームに所属していること
* 自分自身への譲渡でないこと

### Processing Flow

```text
LEADER確認
  ↓
譲渡先確認
  ↓
現LEADER を MEMBER へ更新
  ↓
譲渡先を LEADER へ更新
```

`ux_team_members_leader`（部分UNIQUEインデックス）により、更新順序を誤ると制約違反となる。必ず現LEADERをMEMBERへ変更してから譲渡先をLEADERへ変更する。

### Transaction

```text
BEGIN → 旧LEADER UPDATE(MEMBER) → 新LEADER UPDATE(LEADER) → COMMIT
```

### Updated Tables

`team_members`

### Realtime / Audit Log

TEAM_MEMBER_UPDATED / なし

### Error Codes

`AUTH-001`、`TEAM-001`、`TEAM-005`、`TEAM-006`、`TEAM-009`、`SYSTEM-001`

### Test Cases

正常譲渡、非LEADER、存在しないメンバー、他チームメンバー、自己譲渡

---

# 10. Match Edge Functions

## 10.1 queue-match

### Purpose

チームをマッチング待機キューへ登録し、マッチングを試行する。

### Authentication / Authorization

必須 / チームLEADER

### Input DTO

```typescript
interface QueueMatchRequest {
    teamId: string;
}
```

### Output DTO

```typescript
interface QueueMatchResponse {
    queuedAt: string;
    matched: boolean;
    matchId?: string;
}
```

`matched` は同期的なマッチング試行の結果を示す。相手が見つからない場合は `false` を返し、待機を継続する。これは正常応答であり、エラーではない。

### Validation

* チームが存在すること
* チームがBANされていないこと
* 呼び出しユーザーがLEADERであること
* 進行中の試合が存在しないこと
* 既にキュー登録済みでないこと

### Processing Flow

```text
LEADER確認
  ↓
BAN確認
  ↓
進行中試合の確認
  ↓
重複登録の確認
  ↓
matching_queue INSERT
  ↓
マッチング試行（09_MatchmakingSpecification.md のアルゴリズム）
  ↓
成立すれば matches 作成・キュー削除
```

### Transaction

```text
BEGIN
  matching_queue INSERT
  advisory lock 取得
  マッチング試行
  成立時: matches INSERT → matching_queue DELETE ×2 → audit_logs INSERT
COMMIT
```

### Updated Tables

`matching_queue`、`matches`、`audit_logs`

### Realtime / Audit Log

成立時のみ MATCH_CREATED / 成立時のみ MATCH_CREATED

### Error Codes

`AUTH-001`、`TEAM-001`、`TEAM-005`、`TEAM-006`、`QUEUE-001`、`QUEUE-002`、`QUEUE-005`、`SYSTEM-001`

### Test Cases

正常登録、マッチ成立、相手なしでの待機継続、BANチーム、非LEADER、重複登録、試合中

---

## 10.2 cancel-match-queue

### Purpose

マッチング待機をキャンセルする。

### Authentication / Authorization

必須 / チームLEADER

### Input DTO

```typescript
interface CancelMatchQueueRequest {
    teamId: string;
}
```

### Output DTO

```typescript
interface CancelMatchQueueResponse {
    teamId: string;
}
```

### Validation

* 待機中であること
* 呼び出しユーザーがLEADERであること

### Transaction

```text
BEGIN → matching_queue DELETE → COMMIT
```

### Updated Tables

`matching_queue`

### Realtime / Audit Log

なし / なし

### Error Codes

`AUTH-001`、`TEAM-005`、`QUEUE-003`、`QUEUE-004`、`SYSTEM-001`

### Test Cases

正常キャンセル、未登録、非LEADER、マッチ成立直後のキャンセル失敗

---

## 10.3 report-match

### Purpose

勝者チームが試合結果を申告する。

ADR-009により、勝者チームの**いずれのメンバーでも**実行できる。

### Authentication / Authorization

必須 / 勝者チームのメンバー（LEADER以外も可）

### Input DTO

```typescript
interface ReportMatchRequest {
    matchId: string;
    winnerTeamId: string;
    version: number;
}
```

### Output DTO

```typescript
interface ReportMatchResponse {
    status: "WINNER_REPORTED";
    approveDeadlineAt: string;
    version: number;
}
```

### Validation

* 試合が存在すること
* 試合状態が `PLAYING` であること
* `winnerTeamId` が当該試合の参加チームであること
* 呼び出しユーザーが `winnerTeamId` のチームに所属していること
* `version` が一致すること（楽観ロック）

敗者側からの申告は認めない。自チームを勝者として申告することのみ可能である。

### Processing Flow

```text
試合取得
  ↓
状態確認（PLAYING）
  ↓
所属確認（呼び出しユーザーが winnerTeamId のメンバー）
  ↓
approve_deadline_at = now() + approve_timeout_minutes
  ↓
matches UPDATE（楽観ロック）
  ↓
audit_logs INSERT（MATCH_REPORTED）
```

### Transaction

```text
BEGIN → matches UPDATE → audit_logs INSERT → COMMIT
```

同一チーム内で複数名が同時に申告した場合、楽観ロックにより1件のみ成功する。2人目以降には `MATCH-003` を返す。

### Updated Tables

`matches`、`audit_logs`

### Realtime / Audit Log

WINNER_REPORTED / MATCH_REPORTED

### Error Codes

`AUTH-001`、`MATCH-001`、`MATCH-003`、`MATCH-005`、`MATCH-006`、`MATCH-008`、`SYSTEM-001`

### Test Cases

正常申告、敗者側からの申告拒否、第三者による申告拒否、二重申告、状態不正、version競合

---

## 10.4 approve-match

### Purpose

敗者チームが試合結果を承認し、レート更新を実行する。

ADR-009により、敗者チームの**いずれのメンバーでも**実行できる。

### Authentication / Authorization

必須 / 敗者チームのメンバー（LEADER以外も可）

### Input DTO

```typescript
interface ApproveMatchRequest {
    matchId: string;
    version: number;
}
```

### Output DTO

```typescript
interface ApproveMatchResponse {
    completedAt: string;
    winnerTeamId: string;
    ratings: {
        teamId: string;
        beforeRating: number;
        afterRating: number;
        ratingChange: number;
    }[];
}
```

チームAとチームBを位置で区別せず、`teamId` を明示した配列で返す。

### Validation

* 試合状態が `WINNER_REPORTED` であること
* 呼び出しユーザーが敗者チームに所属していること
* `version` が一致すること

### Processing Flow

```text
試合取得
  ↓
状態確認（WINNER_REPORTED）
  ↓
敗者所属確認
  ↓
system_settings から K値を取得
  ↓
Elo計算（TypeScript純粋関数・08_RatingSpecification.md）
  ↓
matches UPDATE（COMPLETED・completed_at・approved_by・approved_at）
  ↓
rating_history INSERT ×2（k_value を含む）
  ↓
teams UPDATE ×2
  ↓
audit_logs INSERT（MATCH_APPROVED）
```

### Transaction

```text
BEGIN
  matches UPDATE（楽観ロック）
  rating_history INSERT ×2
  teams UPDATE ×2
  audit_logs INSERT
COMMIT
```

### Updated Tables

`matches`、`rating_history`、`teams`、`audit_logs`

### Realtime / Audit Log

MATCH_COMPLETED、RANKING_UPDATED / MATCH_APPROVED

### Error Codes

`AUTH-001`、`MATCH-001`、`MATCH-004`、`MATCH-005`、`MATCH-006`、`MATCH-008`、`RATING-001`、`SYSTEM-001`

### Test Cases

正常承認、二重承認、version競合、勝者側からの承認拒否、第三者による承認拒否、状態不正、レート更新の検証、ロールバック

---

## 10.5 reject-match（**廃止 / ADR-032 ②**）

**本節は廃止した仕様の記録である。実装してはならない。** 現行の仕様は 21.3 を参照。

拒否は敗者が単独で `DRAWN` へ到達できる経路であり、レート変動なし・記録なしで試合を消せた。
承認が一度も合理的な選択肢にならないため廃止した。反論の手段は反対申告（21.2）に置き換わった。

以下は当時の記述である。

### Purpose

敗者チームが申告内容を拒否する（ADR-014）。

拒否すると申告情報が破棄され、試合は `PLAYING` へ戻る。拒否回数が上限に達した場合は `DRAWN` として解散する。

### Authentication / Authorization

必須 / 敗者チームのメンバー（LEADER以外も可）

### Input DTO

```typescript
interface RejectMatchRequest {
    matchId: string;
    version: number;
}
```

### Output DTO

```typescript
interface RejectMatchResponse {
    status: "PLAYING" | "DRAWN";
    rejectCount: number;
    reportDeadlineAt?: string;
}
```

`status` が `DRAWN` の場合、`reportDeadlineAt` は返却しない。

### Validation

* 試合状態が `WINNER_REPORTED` であること
* 呼び出しユーザーが敗者チームに所属していること
* `version` が一致すること

### Processing Flow

```text
試合取得
  ↓
状態確認（WINNER_REPORTED）
  ↓
敗者所属確認
  ↓
reject_count + 1 を算出
  ↓
上限（system_settings.max_reject_count）に達した場合
    → status = 'DRAWN'、completed_at 設定
  ↓
上限未満の場合
    → status = 'PLAYING'
    → winner_team_id / reported_by_profile_id / reported_at / approve_deadline_at をクリア
    → report_deadline_at = now() + report_timeout_minutes（再設定）
  ↓
audit_logs INSERT
```

**`report_deadline_at` の再設定は必須である。** 再設定しない場合、既に当初の申告期限を過ぎていると、`PLAYING` へ戻した直後に自動解決バッチがドロー解散させてしまう。

### Transaction

```text
BEGIN → matches UPDATE（楽観ロック）→ audit_logs INSERT → COMMIT
```

### Updated Tables

`matches`、`audit_logs`

### Realtime / Audit Log

MATCH_REJECTED または MATCH_DRAWN / MATCH_REJECTED または MATCH_DRAWN

### Error Codes

`AUTH-001`、`MATCH-001`、`MATCH-002`、`MATCH-004`、`MATCH-005`、`MATCH-008`、`SYSTEM-001`

拒否により解散した場合は業務エラーではなく、`result = "OK"` かつ `status = "DRAWN"` を返す。`MATCH-007` は、既に解散済みの試合へ再度拒否を試みた場合にのみ使用する。

### Test Cases

正常拒否、拒否後の再申告、拒否上限到達によるドロー解散、期限の再設定確認、勝者側からの拒否拒否、version競合

---

# 11. Internal Edge Functions

## 11.1 matchmaker

### Purpose

待機中チームから対戦カードを生成する。システム内部処理専用。

`queue-match` からの同期呼び出しに加え、取りこぼし救済のためCronでも実行する（ADR準拠の詳細は `09_MatchmakingSpecification.md`）。

### Trigger

* `queue-match` からの同期実行
* Cron（1分間隔）による救済実行

### Authentication / Authorization

Service Role / なし（内部処理）

### Input DTO

```typescript
interface MatchmakerRequest {
    teamId?: string;   // 同期実行時は対象チームを指定
}
```

### Output DTO

```typescript
interface MatchmakerResponse {
    matchedCount: number;
    matchIds: string[];
}
```

### Validation

* BANチームを除外する
* 進行中の試合があるチームを除外する
* 同一チーム同士を組み合わせない

### Processing Flow

```text
advisory lock 取得（多重実行の防止）
  ↓
待機チーム取得（FOR UPDATE SKIP LOCKED）
  ↓
レート差・待機時間・Team ID の優先順位で相手を決定
  ↓
matches INSERT（status='PLAYING'、started_at、report_deadline_at）
  ↓
matching_queue DELETE ×2
  ↓
audit_logs INSERT（MATCH_CREATED）
```

`report_deadline_at` は `now() + system_settings.report_timeout_minutes` で設定する。

### Transaction

```text
BEGIN → advisory lock → matches INSERT → matching_queue DELETE ×2 → audit_logs INSERT → COMMIT
```

### Updated Tables

`matches`、`matching_queue`、`audit_logs`

### Realtime / Audit Log

MATCH_CREATED / MATCH_CREATED

### Error Codes

内部エラーのみ（`SYSTEM-001`）

### Test Cases

通常マッチ、奇数チーム、レート差超過、BANチーム、同時実行時の二重マッチ防止

---

## 11.2 auto-resolve-matches

### Purpose

期限を超過した試合を自動的に解決する（ADR-014）。

### Trigger

Cron（1分間隔）

### Authentication / Authorization

Service Role / なし（内部処理）

### Input DTO

なし

### Output DTO

```typescript
interface AutoResolveResponse {
    drawnCount: number;
    autoApprovedCount: number;
}
```

### Processing Flow

```text
advisory lock 取得
  ↓
① 報告期限切れの処理
   SELECT ... WHERE status = 'PLAYING' AND report_deadline_at < now()
     → status = 'DRAWN'、completed_at = now()
     → audit_logs INSERT（MATCH_DRAWN）
     → Realtime: MATCH_DRAWN
   （レート更新・rating_history 作成は行わない）
  ↓
② 承認期限切れの処理
   SELECT ... WHERE status = 'WINNER_REPORTED' AND approve_deadline_at < now()
     → K値取得 → Elo計算
     → status = 'COMPLETED'、auto_approved = TRUE
     → approved_at = now()、completed_at = now()
     → approved_by_profile_id は NULL のまま
     → rating_history INSERT ×2 → teams UPDATE ×2
     → audit_logs INSERT（MATCH_AUTO_APPROVED）
     → Realtime: MATCH_COMPLETED、RANKING_UPDATED
```

各試合を個別のトランザクションで処理する。1件の失敗が他の試合の処理を妨げないようにするためである。

### Updated Tables

`matches`、`rating_history`、`teams`、`audit_logs`

### Realtime

MATCH_DRAWN、MATCH_COMPLETED、RANKING_UPDATED

### Error Codes

内部エラーのみ（`SYSTEM-001`）

### Test Cases

報告期限切れによるドロー解散、承認期限切れによる自動承認、期限内の試合が処理されないこと、`auto_approved` の設定、レート更新の検証、多重起動時の二重処理防止

---

## 11.3 cleanup-expired-invites

### Purpose

期限切れ招待を `EXPIRED` へ更新する。

### Trigger

Cron（1時間間隔）

### Processing Flow

```text
UPDATE team_invites
   SET status = 'EXPIRED'
 WHERE status = 'ACTIVE'
   AND expires_at < now()
```

参照時にも期限を確認するため、本処理は表示上の整合を保つためのものである。

### Updated Tables

`team_invites`

---

## 11.4 cleanup-matching-queue

### Purpose

滞留した待機情報を削除する安全網。

### Trigger

Cron（10分間隔）

### 削除条件

```text
queued_at < now() - INTERVAL '24 hours'
```

正常な処理ではマッチ成立・キャンセル・BANのいずれかで削除されるため、本処理で削除される件数は通常0件である。件数が継続的に0でない場合は不具合の兆候として扱う。

### Updated Tables

`matching_queue`

---

# 12. Admin Edge Functions

管理者判定は、検証済みJWTの `app_metadata.role` が `admin` であることにより行う（`03_Database.md` 9.1、ADR-020）。

Edge Functions はDB直結でありRLSを迂回するため、各Functionの冒頭で必ずこの判定を行う。判定にDBアクセスは不要である。

すべての管理操作は `audit_logs` へ記録する。

## 12.1 admin-ban-team

### Purpose

チームをBANする。**BANはチームの活動を凍結する措置である**。

### BANの効果範囲

| 操作 | BAN中 | 実装 |
| --- | --- | --- |
| マッチング待機の登録 | 不可（`TEAM-006`） | `queue-match` |
| 待機列への滞留 | BAN時に削除する | `admin-ban-team` |
| 自動マッチングの対象 | 除外する | `_shared/matchmaking.ts` |
| 招待の発行 | 不可（`TEAM-006`） | `create-team-invite` |
| 招待の受諾（メンバー追加） | 不可（`TEAM-006`） | `accept-team-invite` |
| 脱退（メンバー減） | 不可（`TEAM-006`） | `leave-team` |
| リーダーの移譲 | 不可（`TEAM-006`） | `transfer-leader` |
| 進行中の試合 | **中断しない**。申告・承認は可能 | － |
| ランキングへの表示 | 表示する | － |

**★編成の変更をすべて塞ぐ。** 脱退を許すと、全員が抜けて別のチームを作り直すことで
制裁を回避できてしまう。移譲を許すと、凍結中に代表者だけ挿げ替えられ、
誰に対する措置なのかが曖昧になる。

**★進行中の試合は中断しない。** 対戦相手を巻き添えにしないためである。
BANの効果は試合終了後に現れる。

**★個人アカウントの停止ではない。** メンバーはBAN解除後に脱退すれば、
別のチームで活動できる。

### Authentication / Authorization

必須 / 管理者

### Input DTO

```typescript
interface AdminBanTeamRequest {
    teamId: string;
    reason: string;
}
```

### Output DTO

```typescript
interface AdminBanTeamResponse {
    teamId: string;
    isBanned: true;
}
```

### Validation

* 対象チームが存在すること
* `reason` は1〜500文字

### Processing Flow

```text
管理者確認
  ↓
チーム取得
  ↓
teams UPDATE（is_banned = TRUE）
  ↓
matching_queue DELETE
  ↓
audit_logs INSERT（TEAM_BANNED・reason を payload へ）
```

進行中の試合は中断しない。試合終了後にBANの効果が現れる。

### Transaction

```text
BEGIN → teams UPDATE → matching_queue DELETE → audit_logs INSERT → COMMIT
```

### Updated Tables

`teams`、`matching_queue`、`audit_logs`

### Realtime / Audit Log

TEAM_UPDATED / TEAM_BANNED

### Error Codes

`AUTH-001`、`ADMIN-001`、`TEAM-001`、`VALIDATION-001`、`SYSTEM-001`

### Test Cases

正常BAN、既にBAN済み（冪等）、存在しないチーム、非管理者、待機キューからの削除確認

---

## 12.2 admin-unban-team

### Purpose

チームのBANを解除する。

### Authentication / Authorization

必須 / 管理者

### Input DTO

```typescript
interface AdminUnbanTeamRequest {
    teamId: string;
}
```

### Output DTO

```typescript
interface AdminUnbanTeamResponse {
    teamId: string;
    isBanned: false;
}
```

### Updated Tables

`teams`、`audit_logs`

### Realtime / Audit Log

TEAM_UPDATED / TEAM_UNBANNED

### Error Codes

`AUTH-001`、`ADMIN-001`、`TEAM-001`、`SYSTEM-001`

### Test Cases

正常解除、BANされていないチーム（冪等）、非管理者

---

## 12.3 admin-update-system-settings

### Purpose

システム設定を変更する。

### Authentication / Authorization

必須 / 管理者

### Input DTO

```typescript
interface UpdateSystemSettingsRequest {
    teamMaxMembers?: number;
    initialRating?: number;
    ratingK?: number;
    matchRatingRange?: number;
    inviteExpirationHours?: number;
    reportTimeoutMinutes?: number;
    approveTimeoutMinutes?: number;
    // ★廃止（ADR-032 ③）。値は誰も読まない。画面には出さない（ADR-037 ③）。
    maxRejectCount?: number;
    seasonGraceMinutes?: number;
    // 勝敗報告の確定方式（ADR-032 ④⑦⑧⑨ / ADR-034 ②③）。
    queueCooldownMinutes?: number;
    reportExtensionMinutes?: number;
    maxReportExtensions?: number;
    noShowMinutes?: number;
    noShowResponseMinutes?: number;
    maxNoContestRequests?: number;
    mutualNoContestDailyLimit?: number;
    avoidanceDays?: number;
    maxAvoidanceEntries?: number;
    // 保守による一時停止（ADR-034 ⑤）。
    maintenancePaused?: boolean;
    // 表示設定（Issue #8）・お知らせ（Issue #7）は文字列であるため別扱いとする。
    // サブアカウント対策（ADR-036 ⑤）。どちらも 0 が無効を表す。
    rematchCooldownHours?: number;
    rankingMinOpponents?: number;
}
```

指定された項目のみ更新する。

**★`matchmakingPaused` / `updatesLocked` / `currentSeason` を追加してはならない**（ADR-037 ②）。
3列ともシーズン運用の Function だけが書き換える。本APIから触れると、シーズン切替の途中で
運営が状態を壊せるうえ、ADR-034 ⑤ が `maintenance_paused` を別列にした意味が失われる。

**★真偽値は JSON の真偽値のみを受け付ける。** 文字列の `"true"` は `ADMIN-002` とする。
また `false` を「未指定」と取り違えない。判定は `value === undefined` で行う。
取り違えると保守停止を解除できなくなる。

**★サブアカウント対策の ON/OFF はここにしか無い。環境変数では切らない**（ADR-036 ⑤）。
Edge Function の環境変数はテストから切り替えられず、E2E は同じ Supabase を共有する。
設定値であれば本APIから操作でき、既存の管理画面と `audit_logs` にそのまま乗る。

**★設定を追加するときは6箇所すべてを更新する**（ADR-037 ⑥。手順は `03_Database.md` 10.8）。
Migration だけを足して終わりにすると、設計書に載っている設定を運営が変更できない状態になる。

### Output DTO

```typescript
interface UpdateSystemSettingsResponse {
    settings: SystemSettings;
}
```

### Validation

各設定値は `03_Database.md` の `system_settings` CHECK制約に従う。制約違反は `ADMIN-002` を返す。

`teamMaxMembers` を現在の最大所属人数より小さい値へ変更しても、既存チームからメンバーを強制的に脱退させない。新規参加のみ新しい上限で判定する。

### Processing Flow

```text
管理者確認
  ↓
入力値検証
  ↓
system_settings UPDATE（id = 1）
  ↓
audit_logs INSERT（SETTINGS_UPDATED・変更前後の値を payload へ）
```

### Transaction

```text
BEGIN → system_settings UPDATE → audit_logs INSERT → COMMIT
```

### Updated Tables

`system_settings`、`audit_logs`

### Realtime / Audit Log

SYSTEM_SETTINGS_UPDATED / SETTINGS_UPDATED

### Error Codes

`AUTH-001`、`ADMIN-001`、`ADMIN-002`、`SYSTEM-001`

### Test Cases

各項目の更新、境界値、制約違反、非管理者、冪等性、人数上限の縮小

---

# 12.11 admin-create-match

### Purpose

管理者が対戦カードを直接作成する（ADR-035 ⑤ / ADR-039）。大会・イベントを想定する。
**自動マッチングの代わりではない。**

### Authentication / Authorization

必須 / 管理者

### Input DTO

```typescript
interface AdminCreateMatchRequest {
    teamAId: string;
    teamBId: string;
}
```

### Output DTO

```typescript
interface AdminCreateMatchResponse {
    matchId: string;
    teamAId: string;
    teamBId: string;
    reportDeadlineAt: string;
}
```

### 拘束されないもの（ADR-039 ②）

| 対象                     | 理由                                     |
| ---------------------- | -------------------------------------- |
| `match_avoidance`      | 回線相性の抑止は自動マッチングのための仕組みである（ADR-034 ③）   |
| `queue_cooldown_until` | 同上（ADR-032 ④）                          |
| `match_rating_range`   | 実力の近い相手を探すための条件である。組み合わせは運営が決める        |
| 進行中の試合の有無              | **1チームへの複数割り当てが本機能の目的である**（ADR-035 ⑤）  |

**★これらを参照するコードを足してはならない。** 統合テストが問い合わせの有無で固定している。

### 従うもの（ADR-039 ③④）

| 条件                   | エラー          | 理由                                        |
| -------------------- | ------------ | ----------------------------------------- |
| `updates_locked`     | `SEASON-001` | 確定処理に巻き込まれ、直後に `SEASON_END` で打ち切られる（ADR-038 ①） |
| `matchmaking_paused` | `SEASON-002` | 猶予中に作ると、進行中の試合が尽きるのを待つ猶予が終わらない            |
| `maintenance_paused` | `QUEUE-007`  | ADR-034 ⑥ の手順（停止 → 無効化）と矛盾する              |
| BANされたチーム            | `TEAM-006`   | BANは編成も対戦も凍結する（12.1）                      |
| メンバー0人のチーム           | `TEAM-011`   | 誰も報告できず、相手を報告期限まで拘束する                     |
| 同一チーム同士              | `VALIDATION-001` | DBの `chk_matches_teams_different` より前に弾く   |

**★必須人数（`team_max_members`）は要求しない**（ADR-039 ④）。あれは待機列への入り口の条件であり、
本APIは待機列を経由しない。人数の不揃いは画面が示す。

### Processing Flow

```text
管理者確認
  ↓
停止フラグの確認（SEASON-001 / SEASON-002 / QUEUE-007）
  ↓
両チームを ID順に FOR UPDATE で読む（BAN・メンバー数）
  ↓
matches INSERT（PLAYING・report_deadline_at）
  ↓
audit_logs INSERT（MATCH_PREPARED・actor は管理者）
  ↓
Realtime: MATCH_CREATED
```

**★`report_deadline_at` を必ず設定する。** 無いと `auto-resolve-matches` が対象を判定できない。
用意した試合も通常の確定フローに従う（ADR-035 ⑤）。

**★`MATCH_PREPARED` と `MATCH_CREATED` を分ける**（ADR-039 ⑦）。同じ action にすると、
後から「誰が用意した試合か」を数えられない。

**★Realtime は `MATCH_CREATED` を流用する**（ADR-039 ⑨）。受け取る側は試合を再取得するだけであり、
由来によって扱いを変えない。

### Error Codes

`AUTH-001`、`ADMIN-001`、`VALIDATION-001`、`TEAM-001`、`TEAM-006`、`TEAM-011`、
`SEASON-001`、`SEASON-002`、`QUEUE-007`、`SYSTEM-001`

---

# 13. Query Interfaces

読み取り専用インターフェース。クライアントはViewを参照し、複雑なJOINや集計を実装しない。

## 13.1 Ranking

| 項目         | 内容                                     |
| ---------- | -------------------------------------- |
| Source     | `team_ranking_view`                    |
| Purpose    | ランキング表示                                |
| Filter     | なし（BANチームはView側で除外済み）                  |
| Sort       | `rating DESC`, `wins DESC`, `team_name ASC` |
| Pagination | Limit / Offset（デフォルト50件）               |
| RLS        | 全員（未認証を含む）                             |
| Index      | `IX_teams_rating_desc`                 |
| Realtime   | `RANKING_UPDATED` 受信時に再取得               |

```typescript
interface RankingItem {
    teamId: string;
    teamName: string;
    rating: number;
    rank: number;
    wins: number;
    losses: number;
    matches: number;
    winRate: number | null;   // 試合数0のときnull
    distinctOpponents: number; // 異なる対戦相手数（ADR-036 ③）
}
```

順位は View 側の `RANK()` により算出される。同率の場合は同順位となる。

**★掲載条件を満たさないチームは `rank` が NULL で返る**（ADR-036 ③）。一覧を取得する側が
`rank IS NOT NULL` で絞る。View から消していないのは、「自分がなぜ載らないのか」を画面から
説明できるようにするためである。掲載の抑止であって隠蔽ではない。
`ranking_min_opponents = 0` のときは全チームに `rank` が付く。

Offsetページングはレート更新のタイミングによって行の重複・欠落が起こりうる。MVPでは許容し、ランキング更新時はページを先頭から再取得する。

---

## 13.2 Team Detail

| 項目        | 内容                 |
| --------- | ------------------ |
| Source    | `team_detail_view` |
| Parameter | `teamId`           |
| RLS       | 認証済み               |
| Realtime  | `TEAM_UPDATED`、`TEAM_MEMBER_UPDATED` |

```typescript
interface TeamDetail {
    teamId: string;
    teamName: string;
    rating: number;
    isBanned: boolean;
    leaderId: string;
    memberCount: number;
    members: {
        id: string;
        displayName: string;
        avatarUrl?: string;
        role: TeamRole;
    }[];
    createdAt: string;
}
```

---

## 13.3 My Team

| 項目     | 内容                                    |
| ------ | ------------------------------------- |
| Source | `team_detail_view`                    |
| Filter | JWTのユーザーIDが所属するチーム                    |
| RLS    | 認証済み（`team_detail_view` のポリシーに従う）     |
| 応答     | `TeamDetail`（未所属の場合は `null`）          |

未所属の場合はエラーではなく `null` を返す。画面は空状態を表示する。

---

## 13.4 Match List

| 項目         | 内容                                |
| ---------- | --------------------------------- |
| Source     | `match_list_view`                 |
| Filter     | `status`（任意）、`teamId`（任意）          |
| Sort       | `created_at DESC`                 |
| Pagination | Limit / Offset                    |
| RLS        | 認証済み                              |
| Realtime   | `MATCH_CREATED`、`MATCH_COMPLETED`、`MATCH_DRAWN` |

```typescript
interface MatchListItem {
    id: string;
    teamA: TeamSummary;
    teamB: TeamSummary;
    winnerTeamId?: string;
    status: MatchStatus;
    startedAt: string;
    completedAt?: string;
}
```

---

## 13.5 Match Detail

| 項目        | 内容                   |
| --------- | -------------------- |
| Source    | `match_detail_view`  |
| Parameter | `matchId`            |
| RLS       | 認証済み                 |
| Realtime  | `match` チャンネルの全イベント  |

```typescript
interface MatchDetail {
    id: string;
    teamA: TeamSummary;
    teamB: TeamSummary;
    winnerTeamId?: string;
    status: MatchStatus;
    reportedBy?: ProfileSummary;
    reportedAt?: string;
    approvedBy?: ProfileSummary;
    approvedAt?: string;
    autoApproved: boolean;
    rejectCount: number;
    reportDeadlineAt: string;
    approveDeadlineAt?: string;
    startedAt: string;
    completedAt?: string;
    version: number;
}
```

`version` は承認・拒否の際に送信する必要があるため含める。

`finishedAt` は存在しない。

---

## 13.6 Match History

| 項目     | 内容                             |
| ------ | ------------------------------ |
| Source | `match_list_view`              |
| Filter | `teamId`、`status IN ('COMPLETED','DRAWN')` |
| Sort   | `completed_at DESC`            |
| RLS    | 認証済み                           |
| 応答     | `MatchListItem[]`              |

確定済みの試合を対象とする。`DRAWN` も履歴として表示するが、戦績には計上されない。

---

## 13.7 Profile

| 項目     | 内容                |
| ------ | ----------------- |
| Source | `profiles`        |
| Filter | JWTのユーザーID        |
| RLS    | 認証済み（本人）          |

```typescript
interface Profile {
    id: string;
    displayName: string;
    avatarUrl?: string;
    authProvider: string;
}
```

`providerUserId` はクライアントへ返却しない。

管理者かどうかは本DTOに含めない。フロントエンドはセッションJWTの `app_metadata.role` から判定する（ADR-020）。DBとJWTの二重管理による齟齬を避けるためである。

---

## 13.8 Queue Status

| 項目     | 内容                                |
| ------ | --------------------------------- |
| Source | `matching_queue`                  |
| Filter | `teamId`（自チームのみRLSで許可）            |
| RLS    | 自チームのメンバーのみ                       |

```typescript
interface QueueStatus {
    queued: boolean;
    queuedAt?: string;
}
```

---

## 13.9 System Settings

| 項目     | 内容                  |
| ------ | ------------------- |
| Source | `system_settings`   |
| Filter | `id = 1`            |
| RLS    | 認証済み                |
| Realtime | `SYSTEM_SETTINGS_UPDATED` |

```typescript
// ★本DTOだけ列名がスネークケースのままである。他のQueryと異なり、変換層を置いていない。
//   基表 `system_settings` を PostgREST から直接読み、そのまま画面へ渡す。
//   `admin-update-system-settings` の応答（12.3）も同じ形を返す。
interface SystemSettings {
    team_max_members: number;
    initial_rating: number;
    rating_k: number;
    match_rating_range: number;
    invite_expiration_hours: number;
    report_timeout_minutes: number;
    approve_timeout_minutes: number;
    max_reject_count: number;      // 廃止（ADR-032 ③）。画面には出さない
    season_grace_minutes: number;
    queue_cooldown_minutes: number;
    report_extension_minutes: number;
    max_report_extensions: number;
    no_show_minutes: number;
    no_show_response_minutes: number;
    max_no_contest_requests: number;
    mutual_no_contest_daily_limit: number;
    avoidance_days: number;
    max_avoidance_entries: number;
    maintenance_paused: boolean;
    rematch_cooldown_hours: number;
    ranking_min_opponents: number;
    // 表示設定（Issue #8）とお知らせ（Issue #7）も同じ行から返る。
    site_title: string;
    background_image_path: string | null;
    rules_markdown: string;
    announcement_text: string;
    announcement_level: "INFO" | "WARN" | "ALERT";
}
```

**★入力DTO（12.3 `UpdateSystemSettingsRequest`）はキャメルケースである。** 出力と入力で
表記が異なるのは、入力が Edge Function の対応表を通り、出力が基表の行をそのまま返すためである。
`admin-update-system-settings` の `SETTINGS` 対応表がこの変換の正本である（ADR-037 ⑥）。

一般利用者もチーム人数上限や期限を画面表示するために参照する。
`ranking_min_opponents` はランキング画面の掲載条件の案内に用いる（ADR-036 ③）。

**★未認証では参照できない**（`03_Database.md` 15章）。ランキングは未認証でも見えるため、
本設定を使う案内は認証済みのときだけ出す。

---

## 13.10 Season

| 項目       | 内容                                                     |
| -------- | ------------------------------------------------------ |
| Source   | `season_list_view` / `season_ranking_view` / `season_member_view` |
| Purpose  | 過去シーズンの一覧・順位・当時のメンバー                              |
| Filter   | `season_number`（確定済みのシーズンのみViewが返す）                 |
| Sort     | 一覧は `number DESC`、順位は `rank ASC`                        |
| RLS      | 一覧・順位は全員（未認証を含む）／メンバーは認証済み                        |
| Realtime | `SEASON_STATE_CHANGED` 受信時に再取得                          |

**★メンバーだけ認証済み限定である。** 現行の `team_detail_view` と同じ扱いであり、
未認証へ全プレイヤーの表示名を晒さない。

**★チーム名は退避時に複製した値である。** 総解散でチームが削除されても
過去のランキングを表示できるようにするためである（`03_Database.md` 18.9）。

## 13.11 Audit Logs

| 項目         | 内容                            |
| ---------- | ----------------------------- |
| Source     | `audit_logs`                  |
| Filter     | `action`（任意）、`targetType`（任意） |
| Sort       | `created_at DESC`             |
| Pagination | Limit / Offset                |
| RLS        | 管理者のみ                         |

```typescript
interface AuditLogItem {
    id: string;
    actor?: ProfileSummary;
    action: string;
    targetType: string;
    targetId?: string;
    payload?: Record<string, unknown>;
    createdAt: string;
}
```

---

## 13.12 Integrity Signals（ADR-036 ④）

| 項目       | 内容                                              |
| -------- | ----------------------------------------------- |
| Source   | `suspicious_pair_view` / `team_integrity_view`   |
| Purpose  | 繰り返し当たっている組み合わせと、稼ぎ先の偏りを管理者へ提示する            |
| Filter   | ペアは確定2件以上（View側）                                |
| Sort     | ペアは `one_sided_ratio DESC`, `match_count DESC`／チームは `top_opponent_gain_share DESC` |
| RLS      | 管理者のみ。**View 自身の述語で閉じる**（`03_Database.md` 11.8） |
| Realtime | 無し。管理者が開いたときに取得する                              |

**★本APIは判定を返さない。材料を返す。** 措置の導線を画面に置かない。BAN とクールダウンは
通報の画面とチーム管理から行う（ADR-033 ③）。ここに措置を結び付けると、機械の疑いが
そのまま処分に化ける。

**★Edge Function を経由しない。** PostgREST から直接読む。DB直結では `auth.jwt()` が NULL に
なるため、Edge Function からは0件しか返らない。

**★集計元は `matches` / `audit_logs` / `rating_history` のみである。** IPアドレスも端末情報も
収集していない（ADR-036 ⑥）。

---

# 14. Realtime Subscription

| Channel  | 購読対象           | 受信時の動作                                   |
| -------- | -------------- | ---------------------------------------- |
| `ranking` | ランキング画面        | ランキングを再取得                                |
| `match`  | 試合一覧・試合詳細      | 該当Queryを invalidate して再取得                |
| `team`   | チーム画面          | チーム詳細を再取得                                |
| `system` | 全画面（設定値の反映）    | システム設定を再取得                               |

クライアントは受信データを直接キャッシュへ書き込まず、必ず再取得する。

---

# 15. Backend Responsibility Matrix

| 機能         | Query | Edge Function | Realtime |
| ---------- | ----- | ------------- | -------- |
| プロフィール作成   |       | ○             |          |
| プロフィール取得   | ○     |               |          |
| チーム作成      |       | ○             |          |
| 招待発行       |       | ○             |          |
| 招待参加       |       | ○             | ○        |
| 脱退         |       | ○             | ○        |
| LEADER移譲   |       | ○             | ○        |
| キュー登録・マッチ成立 |       | ○             | ○        |
| キュー解除      |       | ○             |          |
| 勝利申告       |       | ○             | ○        |
| 承認         |       | ○             | ○        |
| 拒否         |       | ○             | ○        |
| 自動解決       |       | ○             | ○        |
| ランキング取得    | ○     |               | ○        |
| 試合一覧・詳細取得  | ○     |               | ○        |
| 管理者操作      |       | ○             | ○        |
| 監査ログ取得     | ○     |               |          |

「試合開始」は存在しない。マッチ成立時に `PLAYING` となる（ADR-008）。

---

# 16. エラーハンドリング方針

分類とHTTPステータスの対応は `06_ErrorCode.md` に従う。本書では重複して定義しない。

Edge Functions は例外を捕捉し、必ず共通レスポンス形式で応答する。

---

# 17. ログ出力方針

Edge Functions は実行ごとに以下を標準出力へ記録する（`audit_logs` とは別物である）。

* Function Name
* User ID
* Team ID / Match ID（該当する場合）
* Execution Time
* Result
* Error Code

個人情報・アクセストークン・招待コードの平文をログへ出力してはならない。

---

# 18. AI実装ガイドライン

* Query は読み取り専用とする。更新処理をQueryで実装してはならない。
* 更新処理はすべて Edge Functions に集約する。
* 更新処理はDB直結で明示的にトランザクションを制御する（Supabase SDKを使用しない）。
* DB直結はRLSを迂回するため、Edge Function内で認可チェックを必ず実装する。
* DTOの破壊的変更を行わない。
* Realtime イベントはコミット成功後に送信する。
* エラーコードは `06_ErrorCode.md` の定義のみを使用する。
* 楽観ロック（`version`）を利用して同時更新を防止する。
* 状態遷移は `03_Database.md` 7.1 の遷移表に従う。
* Service Role は内部処理専用とし、クライアントへ露出しない。

---

# 19. 本書の位置づけ

本書に定義した Query、Edge Functions、Realtime をバックエンドの唯一の公開インターフェースとする。

フロントエンドは本書で定義した DTO のみを利用し、データベース構造へ直接依存しない。

新しい機能を追加する場合は、`15_DecisionLog.md` へADRを追加し、本書へ定義を追加してから実装を開始する。

---

# 12.6 admin-end-season

### Purpose

シーズン終了を開始する（Issue #9 / ADR-030）。

### Authorization

管理者のみ（`app_metadata.role = 'admin'`）。

### Input DTO

```typescript
interface EndSeasonRequest {
    disbandActiveTeams?: boolean;  // 通常チームの総解散
    disbandBannedTeams?: boolean;  // BANチームの総解散
}
```

### Processing Flow

1. `seasons` が `ACTIVE` であることを確認する（違えば `SEASON-003`）
2. `ENDING` へ変え、`grace_until = NOW() + season_grace_minutes` を設定する
3. 総解散の選択を `seasons` へ保存する
4. `matchmaking_paused = TRUE`、`matching_queue` を空にする

**★ここでは更新操作を止めない。** 進行中の試合は通常どおり申告・承認できる。
対戦相手を巻き添えにしないためであり、BAN が試合を中断しないのと同じ考え方である（12.1）。

**★総解散の選択をここで保存する。** 確定は cron が自動で行うため、確定時に選ばせられない。

### Error Codes

`AUTH-001`、`ADMIN-001`、`VALIDATION-001`、`SEASON-003`、`SYSTEM-001`

---

# 12.7 finalize-season

**★本Functionは内部処理である**（11章と同じ扱い・4.2）。シーズン運用の流れを追えるよう、
説明は 12.6 と 12.8 の間に置く。`config.toml` に `verify_jwt = false` を書いてはならない。

### Purpose

シーズンを確定する。**cron から呼ぶ内部処理であり、クライアントから呼んではならない。**

### Trigger

pg_cron。1分間隔（Migration 0022）。猶予の粒度が分であるため、これより粗いと
管理者が待たされる時間が読めなくなる。

### Processing Flow

猶予が切れていなければ何もせず戻る。切れている場合、1トランザクションで以下を行う。

1. 残った試合を `DRAWN`（`no_contest_reason = 'SEASON_END'`）にする（レートは動かさない）
2. `updates_locked = TRUE`
3. `season_rankings` へ順位・勝敗・BAN状況を退避する
4. `season_members` へチーム編成を退避する
5. `team_invites` を全削除する
6. `teams.rating` を `initial_rating` へ戻す
7. シーズンを `FINALIZED` にし、次シーズンを `ACTIVE` で作成、`current_season` を進める

**★②が③より前でなければならない。** 退避の後にレートが動くと、
シーズン別ランキングはどの瞬間でもない値を記録する。

**★チームの削除はここで行わない。** `matches.team_a_id` は `ON DELETE RESTRICT` であり、
戦績が残っている限りチームを消せない（12.8）。

**★①は `no_contest_reason` を必ず設定する**（ADR-038 ①）。設定しないと
`chk_matches_drawn_reason` に違反し、**シーズンが確定できない。** 実際に Migration 0023 の
追加時にこの配線が漏れ、猶予切れの時点で進行中の試合が1件でも残っていると本Functionが
失敗する状態になっていた。既定値（猶予10分・申告期限60分）では普通に踏む。

**★`ADMIN_VOID` を流用しない。** あれは `admin-void-matches` の値であり、理由の入力と
`MATCH_VOIDED` の監査ログを伴う（ADR-034 ④）。本Functionはどちらも持たない。

**★`SEASON_END` は不戦にも確定率にも計上せず、クールダウンも課さない**（ADR-038 ②）。
打ち切ったのは運営であり、当事者は対戦の最中でありえた。

---

# 12.8 admin-export-season-data / admin-purge-season-data

### Purpose

確定済みシーズンのデータを持ち出し、削除する。総解散もここで行う。

### Input DTO

```typescript
interface ExportSeasonDataRequest {
    kind: "MATCHES" | "LOGS";
}
```

### 個人情報の除外

| 種別      | 含めない列                                        |
| ------- | -------------------------------------------- |
| MATCHES | `reported_by_profile_id`、`approved_by_profile_id` |
| LOGS    | `actor_profile_id`、`payload`                  |

**★持ち出したファイルは本システムの管理下から出る。** チーム単位の情報に留める。
`payload` を返さないのは、BAN理由などの自由記述が入りうるためである。

### 削除の安全弁

`admin-purge-season-data` は、該当シーズンについて `MATCHES` と `LOGS` の
双方の持ち出し記録（`season_exports`）が無ければ `SEASON-005` を返す。

**★記録を `audit_logs` へ置いてはならない。** ログの削除は本機能の対象であり、
そこへ置くと削除の可否を判断する根拠ごと消える。

### 削除の順序

```text
rating_history → matches → audit_logs → team_members / team_invites → teams
```

**★子から先に消す。** いずれの外部キーも `ON DELETE RESTRICT` である。
総解散が最後になるのはこのためであり、Issue #9 の並びから変更した（ADR-030）。

### Error Codes

`AUTH-001`、`ADMIN-001`、`VALIDATION-001`、`SEASON-003`、`SEASON-005`、`SYSTEM-001`

---

# 12.9 admin-resume-season

### Purpose

通常営業へ戻す。`updates_locked` と `matchmaking_paused` を同時に解除する。

**★片方だけ戻さない。** 編成は変えられるのに対戦できない、あるいはその逆の状態が残る。

**★確定直後に自動で戻さない。** 持ち出しと削除は管理者が任意の時間をかけて行う。
その間に利用者がレートを動かすと、削除の対象が動いてしまう。

**★`maintenance_paused` に触れてはならない**（ADR-034 ⑤ / ADR-038 ⑤）。保守による停止は
シーズン運用とは独立しており、本Functionが解除すると、ゲーム側が復旧していないのに
マッチングが動き出す。**これが両者を別の列にした理由そのものである。**「停止フラグを
まとめてリセットする」という整理をしてはならない。テストで固定してある。

**★再開しても、保守停止が残っていればマッチングは成立しない。** 画面はこれを
押す前に伝える（`05_Frontend.md` 14.11）。

### Error Codes

`AUTH-001`、`ADMIN-001`、`SEASON-003`、`SYSTEM-001`

---

# 12.10 シーズン切替中の利用者操作

`updates_locked` が真の間、利用者側の更新系Functionは `SEASON-001` を返す。
対象は次のとおりである。

`create-team`、`create-team-invite`、`accept-team-invite`、`leave-team`、
`transfer-leader`、`queue-match`、`cancel-match-queue`、
`report-match`、`approve-match`、`concede-match`、`extend-match-deadline`、
`request-no-contest`、`respond-no-contest`

**★通報（20章）は対象外である。** 勝敗にもレートにも影響しないため、更新の凍結対象ではない。

**★`ensure-profile` は対象外である。** ログインを妨げると、利用者は
何が起きているのかを画面で確かめられない。

`matchmaking_paused` が真の間は `queue-match` が `SEASON-002` を返し、
`matchmaker`（cron）も試合を組まない。**画面側の関門だけでは塞げない。**

---

# 20. 通報（Abuse Report）Edge Functions

ADR-033 に基づく。**通報は勝敗フローから完全に独立している。** 本章の Function はいずれも
`matches` を更新せず、レートにも触れない。

節番号を 20 とするのは、既存の章番号を振り直さないためである（本書は末尾へ追記する運用である）。

**★命名。** 通報は `abuse-report` とし、`report` としない。勝敗の申告が `report-match` であり、
同じ語が別の概念を指すと読み違えるためである（`03_Database.md` 10.10）。

---

## 20.1 create-abuse-report

### Purpose

チームに対する通報を登録する。試合の状態とレートには一切影響しない。

### Authentication / Authorization

必須 / **チーム所属は不要**（無所属の利用者も通報できる）

### Input DTO

```typescript
interface CreateAbuseReportRequest {
    targetTeamId: string;
    reasonCode: "FALSE_REPORT" | "NO_SHOW" | "HARASSMENT" | "CHEATING" | "OTHER";
    detail: string;
    matchId?: string;
    evidenceUrls?: string[];
}
```

**★`reporterTeamId` を受け取らない。** `team_members` は `UNIQUE (profile_id)` を持つため
（`03_Database.md` 10.3）、通報者の所属チームは JWT の `sub` から一意に定まる。
クライアントから受け取ると詐称でき、ADR-033 ④ の「通報元チーム数」を偽装できる。

**★`status` を受け取らない。** 登録時は常に `OPEN` である。

### Output DTO

```typescript
interface CreateAbuseReportResponse {
    reportId: string;
    status: "OPEN";
    createdAt: string;
}
```

**通報の受理は「受け付けた」以上の意味を持たない。** 措置の予告や見込みを返さない。

### Validation

| 項目             | 規則                                                   | 違反時            |
| -------------- | ---------------------------------------------------- | -------------- |
| `targetTeamId` | 必須。実在するチームであること                                      | `ABUSE-001`    |
| `targetTeamId` | 通報者の所属チームと異なること                                      | `ABUSE-002`    |
| `reasonCode`   | 必須。定義された5値のいずれかであること                                 | `VALIDATION-001` |
| `detail`       | 必須。10文字以上1000文字以下                                     | `VALIDATION-001` |
| `matchId`      | 任意。指定時は実在する試合であること。**参加チームである必要は無い**                  | `MATCH-001`    |
| `evidenceUrls` | 任意。最大3件。各要素は `https://` で始まり2048文字以下であること             | `VALIDATION-001` |
| 重複             | `matchId` 指定時、同一チームから同一対象・同一試合への通報が存在しないこと            | `ABUSE-003`    |
| 頻度             | `matchId` 未指定時、同一対象への通報が過去24時間に存在しないこと                | `ABUSE-004`    |

**`detail` に下限（10文字）を設けるのは、意味のある記述を求めるためである。** 通報を無償・無制限とする代わりに、
一言では出せないようにする。これが唯一の投稿時の摩擦であり、これ以上の制限は「証拠を持たない訴えを門前払いしない」
という ADR-033 の方針に反する。

**`evidenceUrls` は許可ドメインで絞らない。** 証拠の所在は Discord・画像共有・動画共有と多岐にわたり、
許可リストで絞ると正当な提出が通らなくなる。`https://` のみを要求し、**画面では自動リンクせず、
文字列として表示したうえで明示の操作で開かせる**（`05_Frontend.md`）。

**`matchId` に参加チームの制限を課さない。** 第三者が観戦して気付いた事象も通報できる（ADR-033 ②）。

### Processing Flow

```text
JWT検証
  ↓
通報者の所属チームを team_members から取得（無所属なら NULL）
  ↓
対象チームの存在確認
  ↓
自チーム宛でないことを確認
  ↓
matchId 指定時 … 試合の存在確認 → 重複通報の確認
matchId 未指定時 … 同一対象への24時間以内の通報が無いことを確認
  ↓
abuse_reports へ INSERT（status = 'OPEN'）
  ↓
audit_logs へ ABUSE_REPORTED を記録
```

**シーズン切替中でも通報できる。** `assertUpdatesAllowed` を呼ばない。通報は勝敗にもレートにも
影響しないため、更新の凍結対象ではない。

### Transaction

```text
BEGIN → abuse_reports INSERT → audit_logs INSERT → COMMIT
```

### Updated Tables

`abuse_reports`、`audit_logs`

### Realtime / Audit Log

なし / `ABUSE_REPORTED`

**Realtime通知を送らない。** 通報の発生を他の利用者へ知らせない。対象チームにも知らせない。

監査ログの `target_type` は `TEAM`、`target_id` は `target_team_id` とする。`payload` に `reportId` と
`reasonCode` を格納する。**`audit_logs.target_type` の CHECK 制約を変更しない**ためである
（`REPORT` を追加すると既存の制約を打ち消すMigrationが要る一方、通報の対象はチームであり `TEAM` で正しく表現できる）。

### Error Codes

`AUTH-001`、`VALIDATION-001`、`MATCH-001`、`ABUSE-001`、`ABUSE-002`、`ABUSE-003`、`ABUSE-004`、`SYSTEM-001`

### Test Cases

正常登録、無所属からの登録、自チーム宛の拒否、`detail` の下限・上限、`evidenceUrls` の件数超過と非https、
存在しない対象チーム、存在しない試合、同一試合への重複、24時間以内の再通報、シーズン切替中でも登録できること

---

## 20.2 withdraw-abuse-report

### Purpose

通報者が自分の通報を取り下げる。

誤って出した通報を自分で片付けられるようにする。ADR-033 ⑤ が虚偽の通報を措置の対象とする以上、
**取り下げの経路が無いと、確信の持てない通報が萎縮する。**

### Authentication / Authorization

必須 / 通報者本人

### Input DTO

```typescript
interface WithdrawAbuseReportRequest {
    reportId: string;
}
```

### Output DTO

```typescript
interface WithdrawAbuseReportResponse {
    status: "WITHDRAWN";
}
```

### Validation

* 通報が存在すること（`ABUSE-005`）
* 呼び出しユーザーが `reporter_profile_id` と一致すること（`ABUSE-007`）
* 状態が `OPEN` であること（`ABUSE-006`）

### Processing Flow

```text
JWT検証 → 通報の取得 → 本人確認 → OPEN確認
  ↓
status = 'WITHDRAWN'、resolved_at = NOW() へ UPDATE
（resolved_by_profile_id は NULL のままとする。管理者の措置ではないため）
```

### Transaction

```text
BEGIN → abuse_reports UPDATE → audit_logs INSERT → COMMIT
```

### Updated Tables

`abuse_reports`、`audit_logs`

### Realtime / Audit Log

なし / `ABUSE_WITHDRAWN`

### Error Codes

`AUTH-001`、`VALIDATION-001`、`ABUSE-005`、`ABUSE-006`、`ABUSE-007`、`SYSTEM-001`

### Test Cases

正常取り下げ、他人の通報、処理済みの通報、取り下げ後の再通報が通ること（`ux_abuse_reports_dup` の除外）

---

## 20.3 admin-resolve-abuse-report

### Purpose

管理者が通報を処理して閉じる。**措置はクールダウンとBANに限る**（ADR-033 ③）。
試合の勝敗とレートには触れない。

### Authentication / Authorization

必須 / 管理者

### Input DTO

```typescript
interface AdminResolveAbuseReportRequest {
    reportId: string;
    resolution: "NO_ACTION" | "WARNED" | "COOLDOWN" | "BANNED";
    note?: string;
    cooldownMinutes?: number;
}
```

### Output DTO

```typescript
interface AdminResolveAbuseReportResponse {
    reportId: string;
    status: "NO_ACTION" | "WARNED" | "COOLDOWN" | "BANNED";
    resolvedAt: string;
}
```

### Validation

* 通報が存在すること（`ABUSE-005`）
* 状態が `OPEN` であること（`ABUSE-006`）
* `resolution` が定義された4値のいずれかであること（`VALIDATION-001`）
* `resolution = 'COOLDOWN'` のとき `cooldownMinutes` が 1 以上であること（`VALIDATION-001`）
* `note` は指定時 1000文字以下（`VALIDATION-001`）

### Processing Flow

```text
管理者確認 → 通報の取得 → OPEN確認
  ↓
resolution により分岐
  NO_ACTION / WARNED … 記録のみ
  COOLDOWN          … teams.queue_cooldown_until = NOW() + cooldownMinutes
  BANNED            … チームBAN処理を実行（_shared へ切り出して admin-ban-team と共用する）
  ↓
abuse_reports を UPDATE（status / resolved_by_profile_id / resolved_at / resolution_note）
  ↓
audit_logs へ ABUSE_RESOLVED を記録
```

**BAN処理を重複実装してはならない。** `admin-ban-team` の処理を `_shared/team-sanction.ts` へ切り出し、
本Functionと共用する（レート更新を `_shared/match-completion.ts` へ寄せたのと同じ方針 / ADR-021）。
BANは待機列からの削除と進行中の試合の扱いを伴うため、二箇所に書くと必ずずれる。

**`WARNED` はシステム上の効果を持たない。** 警告の伝達は運営が Discord で行う。本システムは通知手段を持たない。

### Transaction

```text
BEGIN → (teams UPDATE) → abuse_reports UPDATE → audit_logs INSERT → COMMIT
```

### Updated Tables

`abuse_reports`、`audit_logs`、（措置により）`teams`、`matching_queue`

### Realtime / Audit Log

`team` チャンネルへ `TEAM_BANNED`（`BANNED` の場合のみ） / `ABUSE_RESOLVED`

### Error Codes

`AUTH-001`、`AUTH-004`、`VALIDATION-001`、`ABUSE-005`、`ABUSE-006`、`SYSTEM-001`

### Test Cases

4種の措置それぞれ、処理済みの通報、非管理者、`COOLDOWN` の分数欠落、`BANNED` 時にBAN処理が実行されること

---

## 20.4 Query: Abuse Reports（管理者）

### Purpose

管理画面の未処理一覧と、対象チームごとの累積を参照する。

### Output DTO

```typescript
interface AbuseReportSummary {
    reportId: string;
    targetTeam: TeamSummary;
    reporterTeam: TeamSummary | null;   // 無所属の通報者では null
    reasonCode: string;
    detail: string;
    evidenceUrls: string[];
    matchId: string | null;
    status: string;
    createdAt: string;
}

interface AbuseReportAggregate {
    targetTeam: TeamSummary;
    reportCount: number;        // n : 通報件数
    reporterTeamCount: number;  // m : 通報元チーム数（無所属は数えない）
    sanctionCount: number;      // k : 措置件数（COOLDOWN / BANNED）
}
```

**`reporterTeamCount` が判断の主材料である**（ADR-033 ④）。`reportCount` は1チームから何度でも増やせるため、
単独では信号にならない。画面では `m` を先に、`n` を後に表示する。

### 参照方法

`abuse_reports` を PostgREST から直接参照する。RLS により管理者と通報者本人にのみ返る
（`03_Database.md` 10.10）。集計は View（`abuse_report_aggregate_view`）を用いる。

**本Viewを `team_ranking_view` および `team_detail_view` へ結合してはならない**（ADR-032 ⑥）。

---
---

# 21. 勝敗確定 Edge Functions（ADR-032 / ADR-034）

10章（Match Edge Functions）の改訂と追加である。節番号を21とするのは既存の章番号を振り直さないためである。

**運用の原則は「負けたチームが投了する」である。** 勝者申告は敗者が投了しない場合の代替経路であり、
画面でも副次に置く（ADR-032 ①）。

---

## 21.1 concede-match（新設・基本の経路）

### Purpose

敗者チームが自チームの敗北を申告する。**承認を要さず即座に確定し、レートを更新する。**

自分に不利な申告に虚偽の動機は無いため、確認の相手を必要としない。

### Authentication / Authorization

必須 / **敗者チーム（＝自チーム）のいずれのメンバーでも可**（ADR-009）

### Input DTO

```typescript
interface ConcedeMatchRequest {
    matchId: string;
    version: number;
}
```

**`winnerTeamId` を受け取らない。** 投了するチームは呼び出しユーザーの所属チームであり、勝者は
`matches` のもう一方として一意に定まる。受け取ると、投了に見せかけて相手の敗北を登録できてしまう。

### Output DTO

`approve-match` と同じ `CompletionResult` を返す（レート変動を含む）。

### Validation

* 試合が存在すること（`MATCH-001`）
* 状態が `PLAYING` または `WINNER_REPORTED` であること（`MATCH-002`）
* 呼び出しユーザーが当該試合の参加チームのメンバーであること（`MATCH-005`）
* `WINNER_REPORTED` の場合、自チームが `winner_team_id` **でない**こと（`MATCH-009`）
  自分が勝利を申告した試合に投了するのは撤回であり、投了ではない
* `version` が一致すること（`MATCH-008`）

### Processing Flow

```text
JWT検証 → シーズン切替中でないこと（assertUpdatesAllowed）
  ↓
試合と自チームの取得（自チーム＝敗者、相手＝勝者）
  ↓
状態確認（PLAYING / WINNER_REPORTED のいずれか）
  ↓
反対申告の競合中であっても投了できる（ADR-032 ⑩：競合はいずれかの投了で解ける）
  ↓
completeMatch()（_shared/match-completion.ts）でレート確定
  ↓
クールダウンは課さない（ADR-032 ④：最短で次のキューへ入れる）
```

**★`WINNER_REPORTED` からの投了は「承認」と同じ結果になる。** 専用の承認操作を別に持つ必要は無いが、
`approve-match` は互換のため残す。画面では状況に応じて一方だけを表示する（`05_Frontend.md`）。

### Transaction

```text
BEGIN → matches UPDATE → rating_history INSERT ×2 → teams UPDATE ×2 → audit_logs INSERT → COMMIT
```

### Updated Tables

`matches`、`rating_history`、`teams`、`audit_logs`

### Realtime / Audit Log

`MATCH_COMPLETED`、`RANKING_UPDATED` / `MATCH_CONCEDED`

### Error Codes

`AUTH-001`、`VALIDATION-001`、`MATCH-001`、`MATCH-002`、`MATCH-005`、`MATCH-008`、`MATCH-009`、`SEASON-001`、`SYSTEM-001`

### Test Cases

`PLAYING` からの投了、`WINNER_REPORTED` からの投了、反対申告の競合中の投了、
自チームが申告した勝利への投了の拒否、非参加チーム、version不一致、確定後のクールダウンが無いこと

---

## 21.2 report-match（改訂・反対申告の追加）

### 変更点

`WINNER_REPORTED` の試合に対する呼び出しを、**反対申告**として受け付ける（ADR-032 ⑩）。

従来は `MATCH-003`（勝者は既に報告されています）で一律に拒否していた。

### 追加の処理

```text
状態が WINNER_REPORTED の場合
  ↓
呼び出しユーザーの所属チームが winner_team_id と異なることを確認
  （同じなら MATCH-003。自分の申告を二重に出しているだけである）
  ↓
counter_claim_team_id が未設定であることを確認（設定済みなら MATCH-003）
  ↓
counter_claim_team_id / counter_claimed_at を設定
  ↓
approve_deadline_at は変更しない
```

**★`approve_deadline_at` を延長してはならない。** 延長できると、反対申告が期限を引き延ばす道具になり、
ADR-032 が塞いだ「時間で相手を縛る」経路が復活する。

**★自動承認が止まる。** `counter_claim_team_id IS NOT NULL` の間、`auto-resolve-matches` は
自動承認を行わない（21.6）。競合はいずれかの投了でのみ解け、解けなければ承認期限の経過で
`DRAWN`（`CONFLICT`）となる。

### Realtime / Audit Log

`WINNER_REPORTED`（新規申告）／ `MATCH_COUNTER_CLAIMED`（反対申告） / `MATCH_REPORTED` ・ `MATCH_COUNTER_CLAIMED`

### Test Cases

新規申告、相手からの反対申告、自チームからの二重申告の拒否、二度目の反対申告の拒否、
反対申告で `approve_deadline_at` が変わらないこと

---

## 21.3 reject-match（廃止）

**ADR-032 ② により廃止する。** Edge Function・画面の導線・Backend Client・DTO を削除する。

エラーコード `MATCH-007`（拒否回数が上限に達したため試合は解散されました）は発生しなくなる。
**欠番として残し、再利用しない**（`06_ErrorCode.md` 11章）。

反論の手段は 21.2 の反対申告に置き換わった。不正の申し立ては 20章の通報で扱う。

---

## 21.4 extend-match-deadline（新設）

### Purpose

「まだ対戦中である」と宣言して報告期限を延長する（ADR-032 ⑦）。

`report_timeout_minutes` の固定値を延ばす案は採らない。**固定値を延ばすと妨害の効果時間がそのまま延びる。**
長い対戦は当事者の宣言で扱い、沈黙は短い期限で打ち切る。

### Authentication / Authorization

必須 / **いずれかの参加チームのメンバー**

### Input DTO

```typescript
interface ExtendMatchDeadlineRequest {
    matchId: string;
    version: number;
}
```

### Output DTO

```typescript
interface ExtendMatchDeadlineResponse {
    reportDeadlineAt: string;
    extensionCount: number;
    remainingExtensions: number;
}
```

### Validation

* 状態が `PLAYING` であること（`MATCH-002` / `MATCH-003`）
* 参加チームのメンバーであること（`MATCH-005`）
* `report_extension_count < max_report_extensions` であること（`MATCH-010`）
* `version` が一致すること（`MATCH-008`）

### Processing Flow

```text
report_deadline_at = report_deadline_at + report_extension_minutes
report_extension_count += 1
```

**★現在時刻からではなく、既存の期限から加算する。** 現在時刻を起点にすると、期限の直前に延長するのと
直後に延長するのとで得られる猶予が変わり、期限際の駆け引きを生む。

延長は相手チームへ通知し、実施チームを `audit_logs` に残す。

### Realtime / Audit Log

`MATCH_EXTENDED` / `MATCH_EXTENDED`

### Error Codes

`AUTH-001`、`VALIDATION-001`、`MATCH-001`、`MATCH-002`、`MATCH-003`、`MATCH-005`、`MATCH-008`、`MATCH-010`、`SEASON-001`、`SYSTEM-001`

### Test Cases

正常延長、上限到達、`WINNER_REPORTED` での拒否、期限を起点に加算されること、相手チームからの延長

---

## 21.5 request-no-contest / respond-no-contest（新設）

### Purpose

「この試合は成立しなかった」と申請する（ADR-032 ⑧ ＋ ADR-034 ②）。

**結末は相手の応答で決まる。** 申請そのものは結末を決めない。

| 相手の応答                       | 結末                                       |
| --------------------------- | ---------------------------------------- |
| 承諾                          | `DRAWN` / `MUTUAL`。双方に代償なし               |
| 対戦継続の宣言／勝利申告／投了／延長          | 申請は消え、試合は継続する。報告期限は変えない                  |
| 無応答                         | `DRAWN` / `NO_SHOW`。**無応答側のみ**が代償を負う     |

### Authentication / Authorization

必須 / いずれかの参加チームのメンバー（`respond-no-contest` は申請を受けた側のみ）

### Input DTO

```typescript
interface RequestNoContestRequest {
    matchId: string;
    reasonCode: "CONNECTION" | "GAME_ISSUE" | "NO_RESPONSE" | "OTHER";
    version: number;
}

interface RespondNoContestRequest {
    matchId: string;
    response: "ACCEPT" | "CONTINUE";
    version: number;
}
```

**`reasonCode` は結末を左右しない。** 結末を決めるのは相手の応答である。理由は `match_avoidance` の
登録（ADR-034 ③）と運営の観測にのみ用いる。申請者の一方的な自己申告であるため、それ以上の重みを持たせない。

### Validation

| 項目          | 規則                                              | 違反時         |
| ----------- | ----------------------------------------------- | ----------- |
| 状態          | `PLAYING` であること                                 | `MATCH-002` / `MATCH-003` |
| 権限          | 参加チームのメンバーであること                                 | `MATCH-005` |
| 保留中の申請      | 既に保留中の申請が無いこと                                   | `MATCH-011` |
| 申請回数        | `no_contest_request_count < max_no_contest_requests` | `MATCH-012` |
| 応答の権限       | `respond-no-contest` は申請者と**異なる**チームであること       | `MATCH-005` |

**★`PLAYING` に限る**（ADR-034 ②）。`WINNER_REPORTED` から認めると、敗者が勝者へ「無かったことにしてほしい」と
交渉する経路になる。対戦が成立しなかったのであれば勝利の申告は生じない。

### 時間の扱い（ADR-032 ⑧）

```text
申請できる時刻 …………… マッチ成立の直後から。制限を設けない
承諾による成立 …………… 即時。猶予を待たない
無応答による成立 ………… マッチ成立から no_show_minutes を経過し、
                       かつ 申請から no_show_response_minutes を経過した後
```

**★時間の壁を「申請できる時刻」ではなく「沈黙が試合を終わらせる時刻」に置く。**
これにより、対戦できないと分かった時点で直ちに申請でき、かつ劣勢の側が対戦直後に申請して
相手の一時離席に賭ける使い方を防げる。

### 承諾時の追加処理（ADR-034 ②③）

```text
DRAWN / MUTUAL で確定
  ↓
両チームにクールダウンを課さない
  ↓
確定率に計上しない
  ↓
reasonCode = 'CONNECTION' なら match_avoidance へ登録
   （team_low_id / team_high_id は UUID の大小で正規化）
   （チームあたり max_avoidance_entries を超える場合は最も古い行を失効させる）
  ↓
当日の MUTUAL 件数が mutual_no_contest_daily_limit を超える場合のみクールダウンを課す
```

**★`match_avoidance` への登録は承諾ブランチのみ。** `NO_SHOW` では登録しない。
片方の操作で登録できると、強い相手を恒久的に回避する手段になる。

### 無応答による成立

`auto-resolve-matches` が処理する（21.6）。`respond-no-contest` は関与しない。

### Realtime / Audit Log

`MATCH_NO_CONTEST_REQUESTED` / `MATCH_DRAWN` / `MATCH_NO_CONTEST_DECLINED`
 / `MATCH_NO_CONTEST_REQUESTED`・`MATCH_NO_CONTEST_ACCEPTED`・`MATCH_NO_CONTEST_DECLINED`

### Error Codes

`AUTH-001`、`VALIDATION-001`、`MATCH-001`、`MATCH-002`、`MATCH-003`、`MATCH-005`、`MATCH-008`、`MATCH-011`、`MATCH-012`、`SEASON-001`、`SYSTEM-001`

### Test Cases

即時申請、承諾による即時成立、対戦継続の宣言、勝利申告・投了・延長による打ち消し、
無応答の満期前後、申請回数の上限、`WINNER_REPORTED` での拒否、
`CONNECTION` での `match_avoidance` 登録、`NO_SHOW` で登録されないこと、
`mutual_no_contest_daily_limit` 超過時のクールダウン

---

## 21.6 auto-resolve-matches（改訂）

### 変更点

処理を4種類に増やす。いずれも試合ごとに独立したトランザクションで確定する（既存方針を維持）。

| 対象                                                                   | 結末                          | クールダウン    |
| -------------------------------------------------------------------- | --------------------------- | --------- |
| `PLAYING` かつ `report_deadline_at < NOW()`                             | `DRAWN` / `REPORT_TIMEOUT`  | 両チーム      |
| `PLAYING` かつ保留中の申請があり、満期を過ぎた                                          | `DRAWN` / `NO_SHOW`         | 無応答側のみ    |
| `WINNER_REPORTED` かつ `approve_deadline_at < NOW()` かつ `counter_claim_team_id IS NULL` | `COMPLETED`（自動承認）           | 放置した敗者側のみ |
| `WINNER_REPORTED` かつ `approve_deadline_at < NOW()` かつ `counter_claim_team_id IS NOT NULL` | `DRAWN` / `CONFLICT`        | 両チーム      |

**★自動承認の条件に `counter_claim_team_id IS NULL` を必ず含めること。** 含めないと、矛盾する2つの主張が
あるにもかかわらず先に申告した側の主張で確定してしまい、**早く嘘をついた側が勝つ**。

### 無応答による解散の満期

```sql
WHERE status = 'PLAYING'
  AND no_contest_requested_at IS NOT NULL
  AND started_at + (no_show_minutes || ' minutes')::interval < NOW()
  AND no_contest_requested_at + (no_show_response_minutes || ' minutes')::interval < NOW()
```

**2つの条件は AND である。** どちらか一方では、対戦直後の申請が相手の短い離席で成立してしまう。

### CONFLICT への確定

`winner_team_id` を NULL にする（`chk_matches_drawn` の要求）。
**`reported_by_profile_id` / `reported_at` / `counter_claim_team_id` / `counter_claimed_at` は残す。**
誰がどちらを主張したかは通報の判断材料になる（ADR-033 ④）。

### Realtime / Audit Log

`MATCH_DRAWN` / `MATCH_COMPLETED` / `RANKING_UPDATED`
 / `MATCH_DRAWN`・`MATCH_AUTO_APPROVED`・`MATCH_CONFLICT_DRAWN`・`MATCH_NO_SHOW_DRAWN`

---

## 21.7 admin-void-match / admin-void-matches（新設）

### Purpose

ゲーム側の障害・メンテナンスのように、運営が把握できる外部要因で試合を無効化する（ADR-034 ④）。

### Authentication / Authorization

必須 / 管理者

### Input DTO

```typescript
interface AdminVoidMatchRequest {
    matchId: string;
    reason: string;
}

interface AdminVoidMatchesRequest {
    reason: string;
    includeReported?: boolean;   // 既定 false
}
```

### 一括版の既定の対象

**既定は `PLAYING` のみ。** `WINNER_REPORTED` を含めるかは `includeReported` で管理者が明示的に選ぶ。
障害の前に成立していた申告を巻き込んで消さないためである。

### 処理

```text
対象を DRAWN / ADMIN_VOID へ確定
  ↓
レートは変動させない。rating_history も作らない
  ↓
両チームにクールダウンを課さない
  ↓
確定率に計上しない
  ↓
audit_logs へ MATCH_VOIDED（reason を payload に含める）
```

**運営起因・外部起因の不成立は、当事者にいかなる不利益も伴わせない。**

`reason` の入力を必須とする。理由の無い一括無効化は事故と区別できない。

### Error Codes

`AUTH-001`、`AUTH-004`、`VALIDATION-001`、`MATCH-001`、`MATCH-002`、`SYSTEM-001`

---

## 21.8 queue-match（改訂）

### 追加する関門

既存の `QUEUE-002`（進行中の試合）に加えて2つを追加する。判定順は以下とする。

```text
1. assertUpdatesAllowed  … シーズン切替中           → SEASON-001
2. assertMatchmakingAllowed … シーズン終了の猶予中      → SEASON-002
3. maintenance_paused    … 保守による一時停止（ADR-034 ⑤） → QUEUE-007
4. LEADER確認 / BAN確認
5. 進行中の試合（ADR-035 ①）                          → QUEUE-002
6. queue_cooldown_until > NOW()（ADR-032 ④）        → QUEUE-006
7. 重複登録 / 人数
```

**★`maintenance_paused` と `matchmaking_paused` を兼用しない**（`03_Database.md` 10.8）。
`admin-resume-season` が後者を無条件に解除するため、保守停止を同じ列で表すとシーズン再開が
保守停止を解除してしまう。

### 同時参加の判定（ADR-035）

規則は「1チーム同時1試合」ではなく「**進行中の試合を持つチームは待機列に登録できない**」である。
**DBに制約は無い。** 本Functionと `runMatchmaking` の2箇所が唯一の保証である。

```sql
SELECT 1 FROM matches
 WHERE (team_a_id = :team_id OR team_b_id = :team_id)
   AND status NOT IN ('COMPLETED','DRAWN')
```

### Error Codes

既存に `QUEUE-006`、`QUEUE-007` を追加

---

## 21.9 runMatchmaking（改訂）

### 追加する除外条件

```sql
AND NOT EXISTS (
  SELECT 1 FROM match_avoidance a
   WHERE a.expires_at > NOW()
     AND a.team_low_id  = LEAST(q.team_id, c.team_id)
     AND a.team_high_id = GREATEST(q.team_id, c.team_id)
)
```

`match_avoidance` は**ペアの条件**であるため、待機列の絞り込み（単独チームの条件）では表現できない。
候補の選択（`selectOpponent`）の段階で判定する。

`queue_cooldown_until > NOW()` のチームも待機列から除外する。`queue-match` が入り口で弾くが、
クールダウンは登録後にも課されうる（通報への措置）。**入り口の判定だけでは塞げない。**

---

