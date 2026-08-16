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
| MATCH_REJECTED    | 拒否           | reject-match                   |
| MATCH_COMPLETED   | 試合確定（手動・自動）  | approve-match / auto-resolve-matches |
| MATCH_DRAWN       | ドロー解散        | reject-match / auto-resolve-matches |

`MATCH_STARTED` は使用しない。マッチ成立と試合開始が同時であるため `MATCH_CREATED` に統合した（ADR-008）。

## Channel: `ranking`

| Event           | 送信契機          | 送信元                                 |
| --------------- | ------------- | ----------------------------------- |
| RANKING_UPDATED | レート更新後        | approve-match / auto-resolve-matches / admin-reset-ratings |

## Channel: `team`

| Event               | 送信契機            | 送信元                                     |
| ------------------- | --------------- | --------------------------------------- |
| TEAM_UPDATED        | チーム情報の更新・BAN・解除 | admin-ban-team / admin-unban-team       |
| TEAM_MEMBER_UPDATED | メンバー増減・LEADER移譲 | accept-team-invite / leave-team / transfer-leader |

## Channel: `system`

| Event                   | 送信契機   | 送信元                          |
| ----------------------- | ------ | ---------------------------- |
| SYSTEM_SETTINGS_UPDATED | システム設定変更 | admin-update-system-settings |

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

## 10.5 reject-match

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

チームをBANする。**BANはチームの活動を凍結する措置である**（Issue #9）。

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
    maxRejectCount?: number;
}
```

指定された項目のみ更新する。

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

## 12.4 admin-reset-ratings

### Purpose

全チームのレーティングを初期値へ戻す。

本Functionはシーズン機能ではない。シーズン管理はMVP対象外である（`13_FutureFeatures.md`）。

### Authentication / Authorization

必須 / 管理者

### Input DTO

```typescript
interface AdminResetRatingsRequest {
    initialRating?: number;
}
```

省略時は `system_settings.initial_rating` を使用する。

### Output DTO

```typescript
interface AdminResetRatingsResponse {
    affectedTeams: number;
    initialRating: number;
}
```

### Validation

* 進行中の試合が存在しないこと（レート計算の整合性を保つため）
* `initialRating` は `system_settings` のCHECK制約に従う

### Processing Flow

```text
管理者確認
  ↓
進行中試合の確認
  ↓
teams UPDATE（rating = initialRating）
  ↓
audit_logs INSERT（RATING_RESET・対象件数とリセット前の値を payload へ）
```

`rating_history` へは登録しない。`match_id` が NOT NULL かつ `matches` への外部キーであるため、試合に紐づかない履歴を登録できないためである（ADR-017）。

### Transaction

```text
BEGIN → teams UPDATE → audit_logs INSERT → COMMIT
```

### Updated Tables

`teams`、`audit_logs`

### Realtime / Audit Log

RANKING_UPDATED / RATING_RESET

### Error Codes

`AUTH-001`、`ADMIN-001`、`RATING-002`、`RATING-003`、`SYSTEM-001`

### Test Cases

正常リセット、進行中試合がある場合の拒否、`rating_history` が保持されること、監査ログへの記録、非管理者

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
}
```

順位は View 側の `RANK()` により算出される。同率の場合は同順位となる。

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
interface SystemSettings {
    teamMaxMembers: number;
    initialRating: number;
    ratingK: number;
    matchRatingRange: number;
    inviteExpirationHours: number;
    reportTimeoutMinutes: number;
    approveTimeoutMinutes: number;
    maxRejectCount: number;
}
```

一般利用者もチーム人数上限や期限を画面表示するために参照する。

---

## 13.10 Audit Logs

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
