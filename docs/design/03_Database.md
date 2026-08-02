# 03_Database.md

# 固定チームレート戦 戦績管理システム

## データベース設計書

Version: 2.0 (MVP)
Status: Active
Last Updated: 2026-08-03
準拠ADR: ADR-001, ADR-002, ADR-008, ADR-010, ADR-013, ADR-014, ADR-015, ADR-016, ADR-017, ADR-018

---

# 1. 目的

本書は、本システムで利用するデータベースの論理設計・物理設計を定義する。

本設計書は、人間向けの設計資料であると同時に、AIコーディングエージェントが実装可能な粒度で記述する。

対象DBMSは PostgreSQL（Supabase）とする。

本書は以下の正本である（`ReferenceIndex.md` 参照）。

* テーブル・列・制約・インデックス
* View
* 状態遷移
* Row Level Security ポリシー
* トランザクション境界

---

# 2. 設計方針

## 2.1 基本方針

* PostgreSQL標準機能を積極的に利用する
* UUIDを主キーとして採用する
* 外部キー制約を必ず設定する
* データ整合性はDB側で保証する
* 認可はRLSとEdge Functionsの二重で行う
* ビジネスロジックはEdge Functions（TypeScript）で実装する

---

## 2.2 データ管理方針

| 分類          | 内容            | 例                                             |
| ----------- | ------------- | --------------------------------------------- |
| マスタデータ      | 更新頻度が低いデータ    | `system_settings`                             |
| トランザクションデータ | 日々更新されるデータ    | `matches`、`rating_history`                    |
| ワークデータ      | 一時的な作業データ     | `matching_queue`                              |
| 監査データ       | 追記専用の記録       | `audit_logs`                                  |
| 派生データ       | 他データから算出可能な情報 | 勝率、順位、勝数、敗数                                    |

派生データはViewで提供する。

---

## 2.3 正規化

MVPでは第三正規形（3NF）を基本とする。

ただし、性能上必要となる項目については冗長化を認める。

現時点の冗長化対象は `teams.rating` のみとする。これはランキング取得の高速化を目的とする。

---

## 2.4 削除方針

原則として物理削除を行わない。

例外は `matching_queue` のみとし、削除を許可する。

試合履歴・レート履歴・監査ログは永続保存する。

---

## 2.5 トランザクション

以下の更新は必ず単一トランザクションで実施する。

* チーム作成
* 招待受諾
* マッチ成立
* 勝利申告
* 承認（レート更新を含む）
* 拒否
* 自動解決
* 管理者操作

トランザクションの実装方式は ADR-016 に従い、Edge Functions（Deno）からPostgreSQLへ直接接続し、TypeScript内で明示的に `BEGIN` / `COMMIT` / `ROLLBACK` を発行する。

Supabase JavaScript SDK（PostgREST経由）では複数ステートメントにまたがるトランザクションを開始できないため、更新系処理でSDKを使用してはならない。

---

## 2.6 ビジネスロジックの配置

ADR-016により、ビジネスロジックはPL/pgSQLへ集約しない。

| 処理             | 実装場所                    |
| -------------- | ----------------------- |
| Eloレート計算       | TypeScript（純粋関数）        |
| 状態遷移の判定        | TypeScript（Edge Function内） |
| 楽観ロックのversion更新 | TypeScript（UPDATE文で明示）  |
| データ整合性の保証      | DB制約（CHECK・UNIQUE・FK）   |
| `updated_at` 更新 | DB Trigger              |

DBにビジネスロジック関数（レート計算等）を定義してはならない。

---

# 3. 命名規則

命名の正本は `14_Glossary.md` とする。本書はそれに従う。

| 対象      | 規則                     | 例                              |
| ------- | ---------------------- | ------------------------------ |
| テーブル名   | 複数形・snake_case         | `profiles`、`matches`           |
| カラム名    | snake_case             | `created_at`、`winner_team_id`  |
| 主キー     | `id`（UUID）             | －                              |
| 外部キー    | `<参照先単数形>_id`          | `team_id`、`profile_id`         |
| 日時型     | `TIMESTAMPTZ`          | `created_at`、`completed_at`    |
| 真偽値     | `is_xxx` / `has_xxx`   | `is_banned`、`is_admin`         |
| 状態      | TEXT ＋ CHECK制約         | `status`、`role`                |
| View    | 用途＋`_view`             | `team_ranking_view`            |

PostgreSQL Enum型は将来的な状態追加時のマイグレーション負荷が高いため採用しない。

---

# 4. 共通ルール

## 4.1 UUID

すべての主キーはUUIDを利用する。生成は `gen_random_uuid()` により PostgreSQL 側で行う。

例外は `system_settings.id`（固定値 `1` の INTEGER）とする。

---

## 4.2 created_at

全テーブル必須。DEFAULT `now()`。

---

## 4.3 updated_at

更新が発生するテーブルのみ保持する。共通Trigger `update_updated_at()` で自動更新する。

対象：`profiles`、`teams`、`system_settings`

---

## 4.4 NULL

NULLは必要最小限のみ許可し、許可する場合は理由を列定義へ記載する。

---

## 4.5 CHECK制約

状態を管理する列には必ずCHECK制約を設定する。状態値の一覧は `14_Glossary.md` に従う。

---

## 4.6 UNIQUE制約

一意性が必要なデータには必ずUNIQUE制約を設定する。

---

# 5. テーブル一覧

| テーブル            | 種別          | 説明          |
| --------------- | ----------- | ----------- |
| profiles        | Master      | 利用者         |
| teams           | Master      | チーム         |
| team_members    | Relation    | チーム所属       |
| team_invites    | Transaction | チーム招待       |
| matching_queue  | Work        | マッチング待機     |
| matches         | Transaction | 試合          |
| rating_history  | Transaction | レート履歴       |
| system_settings | Master      | システム設定      |
| audit_logs      | Audit       | 監査ログ        |

上記9テーブルがMVP対象である。

---

# 6. ER図（論理）

```text
auth.users
    │ 1:1
profiles ─────────────┐
    │ 1:1             │ 1:N（発行者）
team_members          │
    │ N:1             │
  teams ──────────────┘
    │ │ │
    │ │ └── 1:N ── team_invites
    │ └──── 1:1 ── matching_queue
    │
    │ 1:N（team_a / team_b）
 matches
    │ 1:N
rating_history
```

`profiles` と `team_members` は 1:1 である（MVPでは1プレイヤー1チーム）。

`matches` はMVPでは2チーム固定戦を前提とするため `team_a_id` / `team_b_id` を保持する（ADR-001）。将来的にリーグ戦やBO3へ対応する場合は `match_teams` テーブルへ分離する。

`audit_logs` は業務テーブルと外部キーで結合しない（対象を `target_type` + `target_id` で表現する）。

---

# 7. 状態遷移

## 7.1 Match

本表を試合状態の唯一の正本とする（ADR-008、ADR-014）。

| 遷移元             | 遷移先             | 契機                   | 実行主体              | 更新される列                                                              |
| --------------- | --------------- | -------------------- | ----------------- | ------------------------------------------------------------------- |
| （新規）            | PLAYING         | マッチ成立                | matchmaker        | `started_at`、`report_deadline_at`                                   |
| PLAYING         | WINNER_REPORTED | 勝利申告                 | 勝者チームのメンバー        | `winner_team_id`、`reported_by_profile_id`、`reported_at`、`approve_deadline_at` |
| PLAYING         | DRAWN           | 報告期限切れ               | auto-resolve-matches | `completed_at`                                                      |
| WINNER_REPORTED | COMPLETED       | 承認                   | 敗者チームのメンバー        | `approved_by_profile_id`、`approved_at`、`completed_at`               |
| WINNER_REPORTED | COMPLETED       | 承認期限切れによる自動承認        | auto-resolve-matches | `auto_approved`、`approved_at`、`completed_at`                        |
| WINNER_REPORTED | PLAYING         | 拒否（`reject_count` が上限未満） | 敗者チームのメンバー        | `winner_team_id`=NULL、`reported_by_profile_id`=NULL、`reported_at`=NULL、`approve_deadline_at`=NULL、`reject_count`+1、`report_deadline_at` 再設定 |
| WINNER_REPORTED | DRAWN           | 拒否（`reject_count` が上限到達） | 敗者チームのメンバー        | `reject_count`+1、`completed_at`                                     |

`COMPLETED` および `DRAWN` は終端状態であり、以後の更新を行わない。

上表にない遷移はすべて禁止する。逆遷移も禁止する。

`MATCHED` および `IN_PROGRESS` は使用しない。

---

## 7.2 レート更新の有無

| 状態        | レート更新 | rating_history |
| --------- | ----- | -------------- |
| COMPLETED | あり    | 2件作成           |
| DRAWN     | なし    | 作成しない          |

`DRAWN` は `rating_history` を作成しないため、`team_ranking_view` の戦績に計上されない。

---

## 7.3 Team

チームに状態列は持たない。

| 概念     | 表現方法                                                    |
| ------ | ------------------------------------------------------- |
| BAN状態  | `teams.is_banned`                                       |
| 試合中    | `matches` に終端状態でないレコードが存在するかで導出                         |
| マッチング中 | `matching_queue` にレコードが存在するかで導出                         |

`teams.status` は存在しない。導出可能な状態を列として保持してはならない（二重管理による不整合を防ぐため）。

「1チームは同時に1試合まで」の制約は、後述の部分UNIQUEインデックスによりDB側で保証する。

---

# 8. インデックス方針

インデックスは以下の基準で作成する。

* 主キー
* 外部キー
* UNIQUE列
* 検索条件に使用する列
* ORDER BY対象の列
* バッチ処理が走査する列（部分インデックスを優先する）

不要なインデックスは作成しない。

---

# 9. Row Level Security 方針

すべての業務テーブルでRLSを有効化する。

RLSは最終的な防御線であり、Edge Functions内でも認可を確認する（ADR-016によりEdge FunctionsはDB直結でRLSを迂回するため、Edge Function側の認可チェックは必須である）。

公開範囲はADR-018に従い、以下を原則とする。

| 対象               | 未認証 | 認証済み | 備考              |
| ---------------- | --- | ---- | --------------- |
| ランキング・チームの公開情報   | 可   | 可    | プレイヤー名を含めない     |
| プロフィール           | 不可  | 可    | －               |
| 試合情報             | 不可  | 可    | －               |
| 招待               | 不可  | 自チームのみ | 招待コードの漏洩を防ぐ     |
| マッチング待機          | 不可  | 自チームのみ | 待ち伏せを防ぐ         |
| 監査ログ             | 不可  | 管理者のみ | －               |

---

## 9.1 管理者の判定

管理者は `profiles.is_admin` で表す。

RLSポリシー内で `profiles` を直接参照すると再帰的な評価が発生するため、以下の SECURITY DEFINER 関数を用いて判定する。

```sql
CREATE FUNCTION auth_is_admin() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$;
```

本関数は認可判定のみを行い、ビジネスロジックを含まない（2.6の例外として認める）。

---

# 10. テーブル定義

## 10.1 profiles

### 概要

認証済み利用者の情報を保持する。Supabase Auth（`auth.users`）と1:1で対応する。

認証プロバイダに依存しない設計とする（ADR-015）。

### Columns

| Column           | Type        | NULL | PK | Default | Description                    |
| ---------------- | ----------- | ---- | -- | ------- | ------------------------------ |
| id               | UUID        | No   | ✓  |         | `auth.users.id` と同一値           |
| auth_provider    | TEXT        | No   |    |         | 認証プロバイダ（`steam` / `discord`）   |
| provider_user_id | TEXT        | No   |    |         | プロバイダ側の利用者ID                   |
| display_name     | TEXT        | No   |    |         | 表示名                            |
| avatar_url       | TEXT        | Yes  |    |         | アイコンURL（プロバイダ側に無い場合があるためNULL可） |
| is_admin         | BOOLEAN     | No   |    | FALSE   | 管理者フラグ                         |
| created_at       | TIMESTAMPTZ | No   |    | now()   | 作成日時                           |
| updated_at       | TIMESTAMPTZ | No   |    | now()   | 更新日時                           |

### Constraints

```text
PK_profiles (id)
FK: profiles.id → auth.users.id  ON DELETE CASCADE
UX_profiles_provider (auth_provider, provider_user_id)
CHECK: auth_provider IN ('steam', 'discord')
CHECK: length(display_name) BETWEEN 1 AND 50
```

### Indexes

```text
UX_profiles_provider
IX_profiles_is_admin (is_admin) WHERE is_admin = TRUE
```

### Trigger

`update_updated_at()` を BEFORE UPDATE で適用する。

### RLS

| 操作     | 許可                    |
| ------ | --------------------- |
| SELECT | 認証済みユーザー              |
| INSERT | 本人のみ（`auth.uid() = id`） |
| UPDATE | 本人のみ。ただし `is_admin` は更新不可 |
| DELETE | 禁止                    |

`is_admin` の変更は Migration または管理者による直接操作でのみ行う。

### 運用ルール

* ログイン時に存在しなければ作成する。作成主体は `04_BackendInterface.md` の認証フローで定義する。
* プロバイダ側の情報が更新された場合は `display_name`・`avatar_url` を同期する。
* 削除は行わない。

---

## 10.2 teams

### 概要

固定チームを管理する。レーティングはチーム単位で保持する。

チームリーダーは `team_members.role = 'LEADER'` により管理する（ADR-010）。

### Columns

| Column     | Type        | NULL | PK | Default           | Description |
| ---------- | ----------- | ---- | -- | ----------------- | ----------- |
| id         | UUID        | No   | ✓  | gen_random_uuid() | チームID       |
| name       | TEXT        | No   |    |                   | チーム名        |
| rating     | INTEGER     | No   |    | 1500              | 現在レート       |
| is_banned  | BOOLEAN     | No   |    | FALSE             | BAN状態       |
| created_at | TIMESTAMPTZ | No   |    | now()             | 作成日時        |
| updated_at | TIMESTAMPTZ | No   |    | now()             | 更新日時        |

`rating` のDEFAULTは `system_settings.initial_rating` の初期値と一致させる。実際の初期値設定はEdge Functionが `system_settings` から取得して行う。

### Constraints

```text
PK_teams (id)
UX_teams_name (name)
CHECK: rating >= 100
CHECK: length(name) BETWEEN 1 AND 30
```

レート下限は `08_RatingSpecification.md` のクランプ規則と一致させる（下限100）。

### Indexes

```text
UX_teams_name
IX_teams_rating_desc (rating DESC)
IX_teams_is_banned (is_banned) WHERE is_banned = TRUE
```

### Trigger

`update_updated_at()` を BEFORE UPDATE で適用する。

### RLS

| 操作     | 許可               |
| ------ | ---------------- |
| SELECT | 全員（未認証を含む）       |
| INSERT | Edge Functions のみ |
| UPDATE | Edge Functions のみ |
| DELETE | 禁止               |

チームリーダーによる直接UPDATEは許可しない。`rating` を保護するためである。

### 運用ルール

* チーム削除は行わない。
* BAN時は `is_banned` を更新する。
* レート更新は `approve-match` および自動承認処理のみが実施する。
* チーム名変更はMVP対象外とする。

---

## 10.3 team_members

### 概要

プレイヤーとチームの所属関係を管理する。LEADER権限をここで管理する。

### Columns

| Column     | Type        | NULL | PK | Default           | Description |
| ---------- | ----------- | ---- | -- | ----------------- | ----------- |
| id         | UUID        | No   | ✓  | gen_random_uuid() | ID          |
| team_id    | UUID        | No   |    |                   | 所属チーム       |
| profile_id | UUID        | No   |    |                   | 所属プレイヤー     |
| role       | TEXT        | No   |    | 'MEMBER'          | 権限          |
| joined_at  | TIMESTAMPTZ | No   |    | now()             | 参加日時        |

### Constraints

```text
PK_team_members (id)
FK: team_id → teams.id        ON DELETE RESTRICT
FK: profile_id → profiles.id  ON DELETE RESTRICT
UX_team_members_profile (profile_id)
CHECK: role IN ('LEADER', 'MEMBER')
```

`profile_id` にUNIQUE制約を設けることで「1プレイヤーは1チームのみ所属可能」を保証する。

1チームにつきLEADERを1人に限定するため、以下の部分UNIQUEインデックスを設ける。

```sql
CREATE UNIQUE INDEX ux_team_members_leader
  ON team_members (team_id)
  WHERE role = 'LEADER';
```

### Indexes

```text
UX_team_members_profile
ux_team_members_leader
IX_team_members_team (team_id)
```

### RLS

| 操作     | 許可               |
| ------ | ---------------- |
| SELECT | 認証済みユーザー         |
| INSERT | Edge Functions のみ |
| UPDATE | Edge Functions のみ |
| DELETE | Edge Functions のみ |

### 運用ルール

* チーム作成時に `teams` と同一トランザクションで LEADER を登録する。
* 1チームにLEADERは必ず1人存在する。LEADERが存在しない状態を許可しない。
* LEADERが脱退する場合は、先に別メンバーへLEADERを移譲する。
* チーム人数は `system_settings.team_max_members` を超えてはならない。人数チェックはEdge Functionsがトランザクション内で行う。

---

## 10.4 team_invites

### 概要

チームへの参加招待を管理する。チーム参加は招待制のみとする（ADR-013）。

有効な招待は1チームにつき1件までとする。

招待コードは平文で保存せず、ハッシュ値を保存する。

### Columns

| Column                | Type        | NULL | PK | Default           | Description               |
| --------------------- | ----------- | ---- | -- | ----------------- | ------------------------- |
| id                    | UUID        | No   | ✓  | gen_random_uuid() | 招待ID                      |
| team_id               | UUID        | No   |    |                   | 対象チーム                     |
| invite_code_hash      | TEXT        | No   |    |                   | 招待コードのハッシュ値               |
| created_by_profile_id | UUID        | No   |    |                   | 発行者（LEADER）               |
| status                | TEXT        | No   |    | 'ACTIVE'          | 招待状態                      |
| expires_at            | TIMESTAMPTZ | No   |    |                   | 有効期限                      |
| used_at               | TIMESTAMPTZ | Yes  |    |                   | 利用日時（未使用の間はNULL）          |
| used_by_profile_id    | UUID        | Yes  |    |                   | 利用者（未使用の間はNULL）           |
| created_at            | TIMESTAMPTZ | No   |    | now()             | 作成日時                      |

### Constraints

```text
PK_team_invites (id)
FK: team_id → teams.id                     ON DELETE RESTRICT
FK: created_by_profile_id → profiles.id    ON DELETE RESTRICT
FK: used_by_profile_id → profiles.id       ON DELETE RESTRICT
UX_team_invites_code_hash (invite_code_hash)
CHECK: status IN ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED')
CHECK: expires_at > created_at
CHECK: (status = 'USED') = (used_at IS NOT NULL)
```

1チームにつき有効な招待を1件に限定するため、以下の部分UNIQUEインデックスを設ける。

```sql
CREATE UNIQUE INDEX ux_team_invites_active
  ON team_invites (team_id)
  WHERE status = 'ACTIVE';
```

### Indexes

```text
UX_team_invites_code_hash
ux_team_invites_active
IX_team_invites_expires_at (expires_at) WHERE status = 'ACTIVE'
```

### RLS

| 操作     | 許可                                |
| ------ | --------------------------------- |
| SELECT | 自チームのメンバーのみ                       |
| INSERT | Edge Functions のみ                 |
| UPDATE | Edge Functions のみ                 |
| DELETE | 禁止                                |

SELECTを自チームに限定するのは、招待コードのハッシュ値および招待の存在自体が他チームへ漏れることを防ぐためである。

### 運用ルール

* チームリーダーのみ招待を発行できる。
* 有効な招待が存在する場合は新規作成せず、既存の招待を返却する。
* 招待コードの平文はEdge Functionの応答としてのみ返却し、DBには保存しない。
* 招待利用時は人数上限・BAN状態・有効期限を再確認する。
* 利用後は `status = 'USED'`、取り消し時は `'REVOKED'`、期限切れは `'EXPIRED'` とする。

---

## 10.5 matching_queue

### 概要

マッチング待機中のチームを管理するワークテーブル。履歴は保持しない。

マッチ成立時またはキャンセル時に削除する。

### Columns

| Column    | Type        | NULL | PK | Default | Description |
| --------- | ----------- | ---- | -- | ------- | ----------- |
| team_id   | UUID        | No   | ✓  |         | 待機中チーム      |
| queued_at | TIMESTAMPTZ | No   |    | now()   | 待機開始日時      |

主キーを `team_id` とすることで「1チームにつき1件」を保証する。

### Constraints

```text
PK_matching_queue (team_id)
FK: team_id → teams.id  ON DELETE CASCADE
```

### Indexes

```text
IX_matching_queue_queued_at (queued_at)
```

### RLS

| 操作     | 許可               |
| ------ | ---------------- |
| SELECT | 自チームのメンバーのみ      |
| INSERT | Edge Functions のみ |
| UPDATE | 禁止               |
| DELETE | Edge Functions のみ |

SELECTを自チームに限定するのは、他チームの待機状況を見て有利な相手を狙う「待ち伏せ」を防ぐためである。

### 運用ルール

* 待機中チームは「マッチ成立」「キャンセル」「BAN」のいずれかで削除する。
* マッチングアルゴリズムは `09_MatchmakingSpecification.md` で定義し、Edge Functionsが実行する。
* 同時実行時の二重マッチを防ぐため、マッチング処理は排他制御を行う（10.6 および 09 を参照）。

---

## 10.6 matches

### 概要

試合情報を管理する。本システムの中核テーブル。

勝敗確定・状態遷移・レーティング更新はすべてこのテーブルを起点とする。

マッチ成立時に `PLAYING` で作成する（ADR-008）。

### Columns

| Column                 | Type        | NULL | PK | Default           | Description                     |
| ---------------------- | ----------- | ---- | -- | ----------------- | ------------------------------- |
| id                     | UUID        | No   | ✓  | gen_random_uuid() | 試合ID                            |
| team_a_id              | UUID        | No   |    |                   | チームA                            |
| team_b_id              | UUID        | No   |    |                   | チームB                            |
| winner_team_id         | UUID        | Yes  |    |                   | 勝者（申告前・DRAWN時はNULL）             |
| status                 | TEXT        | No   |    | 'PLAYING'         | 状態                              |
| reported_by_profile_id | UUID        | Yes  |    |                   | 勝利申告者（申告前はNULL）                 |
| reported_at            | TIMESTAMPTZ | Yes  |    |                   | 勝利申告日時（申告前はNULL）                |
| approved_by_profile_id | UUID        | Yes  |    |                   | 承認者（承認前・自動承認時はNULL）             |
| approved_at            | TIMESTAMPTZ | Yes  |    |                   | 承認日時（承認前はNULL）                  |
| auto_approved          | BOOLEAN     | No   |    | FALSE             | 自動承認により確定したか                    |
| reject_count           | INTEGER     | No   |    | 0                 | 拒否された回数                         |
| report_deadline_at     | TIMESTAMPTZ | No   |    |                   | 勝利申告の期限                         |
| approve_deadline_at    | TIMESTAMPTZ | Yes  |    |                   | 承認の期限（申告前はNULL）                 |
| version                | INTEGER     | No   |    | 1                 | 楽観ロック                           |
| started_at             | TIMESTAMPTZ | No   |    | now()             | マッチ成立日時                         |
| completed_at           | TIMESTAMPTZ | Yes  |    |                   | 試合確定日時（COMPLETED・DRAWN時に設定）     |
| created_at             | TIMESTAMPTZ | No   |    | now()             | 作成日時                            |

試合完了日時は `completed_at` とする（ADR-002）。`finished_at` は使用しない。

### Constraints

```text
PK_matches (id)
FK: team_a_id → teams.id                   ON DELETE RESTRICT
FK: team_b_id → teams.id                   ON DELETE RESTRICT
FK: winner_team_id → teams.id              ON DELETE RESTRICT
FK: reported_by_profile_id → profiles.id   ON DELETE RESTRICT
FK: approved_by_profile_id → profiles.id   ON DELETE RESTRICT

CHECK: status IN ('PLAYING', 'WINNER_REPORTED', 'COMPLETED', 'DRAWN')
CHECK: team_a_id <> team_b_id
CHECK: winner_team_id IS NULL
       OR winner_team_id IN (team_a_id, team_b_id)
CHECK: version >= 1
CHECK: reject_count >= 0
```

### 不変条件

以下はCHECK制約として実装する。

```sql
-- WINNER_REPORTED では申告情報が揃っていること
CHECK (status <> 'WINNER_REPORTED' OR (
  winner_team_id IS NOT NULL
  AND reported_by_profile_id IS NOT NULL
  AND reported_at IS NOT NULL
  AND approve_deadline_at IS NOT NULL
))

-- COMPLETED では勝者と確定情報が揃っていること
-- 自動承認の場合は approved_by_profile_id が NULL となる
CHECK (status <> 'COMPLETED' OR (
  winner_team_id IS NOT NULL
  AND completed_at IS NOT NULL
  AND approved_at IS NOT NULL
  AND (approved_by_profile_id IS NOT NULL OR auto_approved = TRUE)
))

-- DRAWN では勝者が存在しないこと
CHECK (status <> 'DRAWN' OR (
  winner_team_id IS NULL
  AND completed_at IS NOT NULL
))

-- PLAYING では申告情報が存在しないこと
CHECK (status <> 'PLAYING' OR (
  winner_team_id IS NULL
  AND reported_by_profile_id IS NULL
  AND reported_at IS NULL
))
```

### Indexes

```text
IX_matches_created (created_at DESC)
IX_matches_status (status)
IX_matches_team_a (team_a_id)
IX_matches_team_b (team_b_id)
```

自動解決バッチ用の部分インデックス。

```sql
CREATE INDEX ix_matches_report_deadline
  ON matches (report_deadline_at)
  WHERE status = 'PLAYING';

CREATE INDEX ix_matches_approve_deadline
  ON matches (approve_deadline_at)
  WHERE status = 'WINNER_REPORTED';
```

### 同時1試合制約

「1チームは同時に1試合まで」をDB側で保証する。

```sql
CREATE UNIQUE INDEX ux_matches_active_team_a
  ON matches (team_a_id)
  WHERE status NOT IN ('COMPLETED', 'DRAWN');

CREATE UNIQUE INDEX ux_matches_active_team_b
  ON matches (team_b_id)
  WHERE status NOT IN ('COMPLETED', 'DRAWN');
```

終端状態は `COMPLETED` と `DRAWN` の2つである。条件を `status <> 'COMPLETED'` とすると、解散済みの試合がチームを永久にブロックするため誤りである。

なお本インデックスは同一チームがteam_a側とteam_b側に分かれて同時参加する場合を検出できないため、マッチ生成時にEdge Functionsが両側を確認する。

### 楽観ロック

`version` を利用する。version の加算はTrigger では行わず、UPDATE文で明示的に行う（ADR-016）。

```sql
UPDATE matches
SET status = 'WINNER_REPORTED',
    version = version + 1
WHERE id = :match_id
  AND version = :current_version;
```

更新件数が0件の場合は同時更新エラーとして扱う。

### RLS

| 操作     | 許可               |
| ------ | ---------------- |
| SELECT | 認証済みユーザー         |
| INSERT | Edge Functions のみ |
| UPDATE | Edge Functions のみ |
| DELETE | 禁止               |

### 運用ルール

* 状態遷移は 7.1 の遷移表に従う。
* `COMPLETED` および `DRAWN` の後は更新しない。管理者による訂正もMVPでは行わない。
* レート更新は承認（手動・自動を問わない）時のみ実施する。

---

## 10.7 rating_history

### 概要

チームレーティングの更新履歴を保持する。

レートは試合が `COMPLETED` になった時点で更新される。1試合につき2件（両チーム分）を登録する。

`DRAWN` では作成しない。

履歴は更新・削除しない。監査データとして永続保存する。

### Columns

| Column        | Type        | NULL | PK | Default           | Description   |
| ------------- | ----------- | ---- | -- | ----------------- | ------------- |
| id            | UUID        | No   | ✓  | gen_random_uuid() | 履歴ID          |
| match_id      | UUID        | No   |    |                   | 対象試合          |
| team_id       | UUID        | No   |    |                   | 対象チーム         |
| before_rating | INTEGER     | No   |    |                   | 更新前レート        |
| after_rating  | INTEGER     | No   |    |                   | 更新後レート        |
| rating_change | INTEGER     | No   |    |                   | 増減値           |
| k_value       | INTEGER     | No   |    |                   | 適用したK値        |
| result        | TEXT        | No   |    |                   | `WIN` / `LOSE` |
| completed_at  | TIMESTAMPTZ | No   |    |                   | 試合確定日時        |
| created_at    | TIMESTAMPTZ | No   |    | now()             | 登録日時          |

`k_value` は試合確定時点で適用されたK値を保存する。これによりK値変更後も過去の計算を検証できる。

### Constraints

```text
PK_rating_history (id)
FK: match_id → matches.id  ON DELETE RESTRICT
FK: team_id → teams.id     ON DELETE RESTRICT
UX_rating_history_match_team (match_id, team_id)
CHECK: result IN ('WIN', 'LOSE')
CHECK: after_rating >= 100
CHECK: rating_change = after_rating - before_rating
CHECK: k_value > 0
```

### Indexes

```text
UX_rating_history_match_team
IX_rating_history_team_completed (team_id, completed_at DESC)
IX_rating_history_match (match_id)
IX_rating_history_completed (completed_at DESC)
```

### RLS

| 操作     | 許可               |
| ------ | ---------------- |
| SELECT | 認証済みユーザー         |
| INSERT | Edge Functions のみ |
| UPDATE | 禁止               |
| DELETE | 禁止               |

### 運用ルール

* 管理者によるレートリセットは本テーブルへ登録しない。`audit_logs` へ記録する（ADR-017）。試合に紐づかない履歴は `match_id` の外部キー制約により登録できないためである。
* `rating_change` は計算結果を保存する。参照のたびに再計算しない。

---

## 10.8 system_settings

### 概要

システム全体の設定を保持する。必ず1レコードのみ保持し、初期データ（Seed）として登録する。

### Columns

| Column                  | Type        | NULL | PK | Default | Description        |
| ----------------------- | ----------- | ---- | -- | ------- | ------------------ |
| id                      | INTEGER     | No   | ✓  | 1       | 固定値                |
| team_max_members        | INTEGER     | No   |    | 3       | チーム人数上限            |
| initial_rating          | INTEGER     | No   |    | 1500    | 初期レート              |
| rating_k                | INTEGER     | No   |    | 32      | K値                 |
| match_rating_range      | INTEGER     | No   |    | 400     | マッチング許容レート差        |
| invite_expiration_hours | INTEGER     | No   |    | 24      | 招待の有効期間（時間）        |
| report_timeout_minutes  | INTEGER     | No   |    | 60      | 勝利申告の期限（分）         |
| approve_timeout_minutes | INTEGER     | No   |    | 10      | 承認の期限（分）           |
| max_reject_count        | INTEGER     | No   |    | 2       | 拒否の上限回数            |
| updated_at              | TIMESTAMPTZ | No   |    | now()   | 更新日時               |

### Constraints

```text
PK_system_settings (id)
CHECK: id = 1
CHECK: team_max_members > 1
CHECK: initial_rating >= 100
CHECK: rating_k BETWEEN 1 AND 128
CHECK: match_rating_range > 0
CHECK: invite_expiration_hours > 0
CHECK: report_timeout_minutes > 0
CHECK: approve_timeout_minutes > 0
CHECK: max_reject_count >= 0
```

`rating_k` の上限を128とすることで、K値の境界値テストが定義可能になる。

### Trigger

`update_updated_at()` を BEFORE UPDATE で適用する。

### RLS

| 操作     | 許可               |
| ------ | ---------------- |
| SELECT | 認証済みユーザー         |
| INSERT | 禁止               |
| UPDATE | Edge Functions のみ |
| DELETE | 禁止               |

管理者判定はEdge Function内で `auth_is_admin()` により行う。

### 運用ルール

* 更新対象は `id = 1` 固定とする。
* 設定変更は管理者のみが実施でき、`audit_logs` へ記録する。

---

## 10.9 audit_logs

### 概要

管理操作・試合結果の確定・認証失敗・権限違反を記録する追記専用テーブル（ADR-017）。

業務テーブルと外部キーで結合せず、`target_type` と `target_id` で対象を表現する。

### Columns

| Column           | Type        | NULL | PK | Default           | Description                |
| ---------------- | ----------- | ---- | -- | ----------------- | -------------------------- |
| id               | UUID        | No   | ✓  | gen_random_uuid() | ログID                       |
| actor_profile_id | UUID        | Yes  |    |                   | 操作者（システム操作・未認証時はNULL）      |
| action           | TEXT        | No   |    |                   | 操作種別                       |
| target_type      | TEXT        | No   |    |                   | 対象種別（`TEAM` / `MATCH` など）  |
| target_id        | TEXT        | Yes  |    |                   | 対象ID（対象が無い場合はNULL）         |
| payload          | JSONB       | Yes  |    |                   | 補足情報（変更前後の値など）             |
| created_at       | TIMESTAMPTZ | No   |    | now()             | 記録日時                       |

### 記録対象

| action                  | 記録契機          |
| ----------------------- | ------------- |
| TEAM_CREATED            | チーム作成         |
| TEAM_BANNED             | チームBAN        |
| TEAM_UNBANNED           | BAN解除         |
| MATCH_CREATED           | マッチ成立         |
| MATCH_REPORTED          | 勝利申告          |
| MATCH_APPROVED          | 承認（手動）        |
| MATCH_AUTO_APPROVED     | 承認（自動）        |
| MATCH_REJECTED          | 拒否            |
| MATCH_DRAWN             | ドロー解散         |
| RATING_RESET            | レートリセット       |
| SETTINGS_UPDATED        | システム設定変更      |
| AUTH_FAILED             | 認証失敗          |
| AUTHORIZATION_DENIED    | 権限違反          |

### Constraints

```text
PK_audit_logs (id)
FK: actor_profile_id → profiles.id  ON DELETE RESTRICT
CHECK: target_type IN ('TEAM', 'MATCH', 'PROFILE', 'INVITE', 'SETTINGS', 'AUTH')
```

### Indexes

```text
IX_audit_logs_created (created_at DESC)
IX_audit_logs_actor (actor_profile_id)
IX_audit_logs_target (target_type, target_id)
```

### RLS

| 操作     | 許可               |
| ------ | ---------------- |
| SELECT | 管理者のみ            |
| INSERT | Edge Functions のみ |
| UPDATE | 禁止               |
| DELETE | 禁止               |

### 運用ルール

* 本テーブルは追記専用とする。更新・削除を行ってはならない。
* 個人情報・アクセストークンを `payload` へ記録してはならない。
* 監査ログの記録失敗は業務処理を失敗させない（記録はトランザクション外で行うか、失敗をログ出力に留める）。

---

# 11. View定義

画面は原則としてViewを参照し、複雑なJOINや集計をクライアントで実装しない。

## 11.1 team_ranking_view

### 概要

ランキング表示専用View。未認証でも参照できる（ADR-018）。

### Columns

| Column    | Description |
| --------- | ----------- |
| team_id   | チームID       |
| team_name | チーム名        |
| rating    | 現在レート       |
| rank      | 順位          |
| wins      | 勝利数         |
| losses    | 敗北数         |
| matches   | 試合数         |
| win_rate  | 勝率（0〜1、試合数0のときNULL） |

### 定義

```sql
CREATE VIEW team_ranking_view AS
SELECT
    t.id   AS team_id,
    t.name AS team_name,
    t.rating,
    RANK() OVER (ORDER BY t.rating DESC)          AS rank,
    COALESCE(h.wins, 0)                            AS wins,
    COALESCE(h.losses, 0)                          AS losses,
    COALESCE(h.wins, 0) + COALESCE(h.losses, 0)    AS matches,
    COALESCE(h.wins, 0)::NUMERIC
      / NULLIF(COALESCE(h.wins, 0) + COALESCE(h.losses, 0), 0) AS win_rate
FROM teams t
LEFT JOIN (
    SELECT
        team_id,
        COUNT(*) FILTER (WHERE result = 'WIN')  AS wins,
        COUNT(*) FILTER (WHERE result = 'LOSE') AS losses
    FROM rating_history
    GROUP BY team_id
) h ON h.team_id = t.id
WHERE t.is_banned = FALSE;
```

### 設計上の注意

* BANされたチームは除外する。
* `LEFT JOIN` により、試合を1度も行っていないチームもランキングに表示される。
* `NULLIF` によりゼロ除算を回避する。試合数0の場合 `win_rate` はNULLとなる。
* `DRAWN` の試合は `rating_history` を作成しないため、戦績に計上されない。
* 順位は `RANK()` を用いる。同率の場合は同順位とし、次の順位を飛ばす。

### 並び順

クライアントは以下の順序で取得する。

```text
rating DESC, wins DESC, team_name ASC
```

### RLS

`teams` のポリシーに従う（未認証を含む全員がSELECT可能）。

プレイヤー個人を特定できる情報を含めてはならない。

---

## 11.2 team_detail_view

### 概要

チーム詳細画面用View。メンバー一覧を含むため認証を必須とする。

### Columns

| Column      | Type    | Description             |
| ----------- | ------- | ----------------------- |
| team_id     | UUID    | チームID                   |
| team_name   | TEXT    | チーム名                    |
| rating      | INTEGER | 現在レート                   |
| is_banned   | BOOLEAN | BAN状態                   |
| leader_id   | UUID    | リーダーのprofile_id         |
| member_count | INTEGER | 所属人数                    |
| members     | JSONB   | メンバー配列（id・displayName・avatarUrl・role） |
| created_at  | TIMESTAMPTZ | 作成日時                |

### 定義

```sql
CREATE VIEW team_detail_view AS
SELECT
    t.id   AS team_id,
    t.name AS team_name,
    t.rating,
    t.is_banned,
    (SELECT tm.profile_id
       FROM team_members tm
      WHERE tm.team_id = t.id AND tm.role = 'LEADER') AS leader_id,
    (SELECT COUNT(*)
       FROM team_members tm
      WHERE tm.team_id = t.id)                        AS member_count,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',          p.id,
               'displayName', p.display_name,
               'avatarUrl',   p.avatar_url,
               'role',        tm.role
             ) ORDER BY tm.role, tm.joined_at)
        FROM team_members tm
        JOIN profiles p ON p.id = tm.profile_id
       WHERE tm.team_id = t.id
    ), '[]'::jsonb)                                   AS members,
    t.created_at
FROM teams t;
```

### RLS

認証済みユーザーのみ参照可能とする。

---

## 11.3 match_list_view

### 概要

試合一覧・戦績表示用View。

### Columns

| Column         | Type        | Description       |
| -------------- | ----------- | ----------------- |
| id             | UUID        | 試合ID              |
| team_a_id      | UUID        | チームAのID           |
| team_a_name    | TEXT        | チームA名             |
| team_a_rating  | INTEGER     | チームAの現在レート        |
| team_b_id      | UUID        | チームBのID           |
| team_b_name    | TEXT        | チームB名             |
| team_b_rating  | INTEGER     | チームBの現在レート        |
| winner_team_id | UUID        | 勝者（未確定・DRAWN時NULL） |
| status         | TEXT        | 状態                |
| started_at     | TIMESTAMPTZ | マッチ成立日時           |
| completed_at   | TIMESTAMPTZ | 確定日時（未確定時NULL）    |
| created_at     | TIMESTAMPTZ | 作成日時              |

### 定義

```sql
CREATE VIEW match_list_view AS
SELECT
    m.id,
    m.team_a_id, ta.name AS team_a_name, ta.rating AS team_a_rating,
    m.team_b_id, tb.name AS team_b_name, tb.rating AS team_b_rating,
    m.winner_team_id,
    m.status,
    m.started_at,
    m.completed_at,
    m.created_at
FROM matches m
JOIN teams ta ON ta.id = m.team_a_id
JOIN teams tb ON tb.id = m.team_b_id;
```

### RLS

認証済みユーザーのみ参照可能とする。

---

## 11.4 match_detail_view

### 概要

試合詳細画面用View。申告者・承認者の情報を含む。

### Columns

`match_list_view` の全列に加えて以下を持つ。

| Column                | Type        | Description        |
| --------------------- | ----------- | ------------------ |
| reported_by_id        | UUID        | 申告者のprofile_id     |
| reported_by_name      | TEXT        | 申告者の表示名            |
| reported_at           | TIMESTAMPTZ | 申告日時               |
| approved_by_id        | UUID        | 承認者のprofile_id     |
| approved_by_name      | TEXT        | 承認者の表示名            |
| approved_at           | TIMESTAMPTZ | 承認日時               |
| auto_approved         | BOOLEAN     | 自動承認により確定したか       |
| reject_count          | INTEGER     | 拒否された回数            |
| report_deadline_at    | TIMESTAMPTZ | 勝利申告の期限            |
| approve_deadline_at   | TIMESTAMPTZ | 承認の期限              |
| version               | INTEGER     | 楽観ロック（更新時に必要）      |

### 定義

```sql
CREATE VIEW match_detail_view AS
SELECT
    m.id,
    m.team_a_id, ta.name AS team_a_name, ta.rating AS team_a_rating,
    m.team_b_id, tb.name AS team_b_name, tb.rating AS team_b_rating,
    m.winner_team_id,
    m.status,
    m.started_at,
    m.completed_at,
    m.created_at,
    m.reported_by_profile_id AS reported_by_id,
    rp.display_name          AS reported_by_name,
    m.reported_at,
    m.approved_by_profile_id AS approved_by_id,
    ap.display_name          AS approved_by_name,
    m.approved_at,
    m.auto_approved,
    m.reject_count,
    m.report_deadline_at,
    m.approve_deadline_at,
    m.version
FROM matches m
JOIN teams ta ON ta.id = m.team_a_id
JOIN teams tb ON tb.id = m.team_b_id
LEFT JOIN profiles rp ON rp.id = m.reported_by_profile_id
LEFT JOIN profiles ap ON ap.id = m.approved_by_profile_id;
```

`version` を含めるのは、承認・拒否の際にクライアントが楽観ロック値を送信する必要があるためである。

### RLS

認証済みユーザーのみ参照可能とする。

---

# 12. 外部キー一覧

| Table          | Column                 | References    | ON DELETE | ON UPDATE |
| -------------- | ---------------------- | ------------- | --------- | --------- |
| profiles       | id                     | auth.users.id | CASCADE   | CASCADE   |
| team_members   | team_id                | teams.id      | RESTRICT  | CASCADE   |
| team_members   | profile_id             | profiles.id   | RESTRICT  | CASCADE   |
| team_invites   | team_id                | teams.id      | RESTRICT  | CASCADE   |
| team_invites   | created_by_profile_id  | profiles.id   | RESTRICT  | CASCADE   |
| team_invites   | used_by_profile_id     | profiles.id   | RESTRICT  | CASCADE   |
| matching_queue | team_id                | teams.id      | CASCADE   | CASCADE   |
| matches        | team_a_id              | teams.id      | RESTRICT  | CASCADE   |
| matches        | team_b_id              | teams.id      | RESTRICT  | CASCADE   |
| matches        | winner_team_id         | teams.id      | RESTRICT  | CASCADE   |
| matches        | reported_by_profile_id | profiles.id   | RESTRICT  | CASCADE   |
| matches        | approved_by_profile_id | profiles.id   | RESTRICT  | CASCADE   |
| rating_history | match_id               | matches.id    | RESTRICT  | CASCADE   |
| rating_history | team_id                | teams.id      | RESTRICT  | CASCADE   |
| audit_logs     | actor_profile_id       | profiles.id   | RESTRICT  | CASCADE   |

`teams` および `profiles` は削除しないため、参照側は `RESTRICT` としてよい。

`matching_queue` のみ `CASCADE` とするのは、ワークテーブルであり残存させる意味がないためである。

---

# 13. インデックス一覧

| Table          | Index                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| profiles       | `UX_profiles_provider`、`IX_profiles_is_admin`                                              |
| teams          | `UX_teams_name`、`IX_teams_rating_desc`、`IX_teams_is_banned`                                |
| team_members   | `UX_team_members_profile`、`ux_team_members_leader`、`IX_team_members_team`                  |
| team_invites   | `UX_team_invites_code_hash`、`ux_team_invites_active`、`IX_team_invites_expires_at`          |
| matching_queue | `IX_matching_queue_queued_at`                                                              |
| matches        | `IX_matches_created`、`IX_matches_status`、`IX_matches_team_a`、`IX_matches_team_b`、`ix_matches_report_deadline`、`ix_matches_approve_deadline`、`ux_matches_active_team_a`、`ux_matches_active_team_b` |
| rating_history | `UX_rating_history_match_team`、`IX_rating_history_team_completed`、`IX_rating_history_match`、`IX_rating_history_completed` |
| audit_logs     | `IX_audit_logs_created`、`IX_audit_logs_actor`、`IX_audit_logs_target`                       |

---

# 14. 共通Trigger・Function

## 14.1 update_updated_at()

`updated_at` を `now()` へ更新する。BEFORE UPDATE で使用する。

対象：`profiles`、`teams`、`system_settings`

---

## 14.2 auth_is_admin()

管理者判定を行う SECURITY DEFINER 関数（9.1参照）。

---

## 14.3 廃止した関数

以下はADR-016により廃止した。ビジネスロジックをDBへ配置しないためである。

| 関数                         | 廃止理由                                        |
| -------------------------- | ------------------------------------------- |
| `calculate_rating_change()` | Eloレート計算はTypeScriptの純粋関数として実装する（単体テスト容易性のため） |
| `increment_match_version()` | version の加算はUPDATE文で明示的に行う（Triggerとの二重加算を防ぐため） |

---

# 15. Row Level Security 一覧

本節を各テーブルのRLSの正本とする。10章の記載と一致していなければならない。

| Table           | SELECT        | INSERT         | UPDATE         | DELETE         |
| --------------- | ------------- | -------------- | -------------- | -------------- |
| profiles        | 認証済み          | 本人             | 本人（`is_admin` を除く） | 禁止             |
| teams           | 全員（未認証を含む）    | Edge Functions | Edge Functions | 禁止             |
| team_members    | 認証済み          | Edge Functions | Edge Functions | Edge Functions |
| team_invites    | 自チームのメンバー     | Edge Functions | Edge Functions | 禁止             |
| matching_queue  | 自チームのメンバー     | Edge Functions | 禁止             | Edge Functions |
| matches         | 認証済み          | Edge Functions | Edge Functions | 禁止             |
| rating_history  | 認証済み          | Edge Functions | 禁止             | 禁止             |
| system_settings | 認証済み          | 禁止             | Edge Functions | 禁止             |
| audit_logs      | 管理者           | Edge Functions | 禁止             | 禁止             |

View のRLSは基となるテーブルに従う。

| View               | SELECT     |
| ------------------ | ---------- |
| team_ranking_view  | 全員（未認証を含む） |
| team_detail_view   | 認証済み       |
| match_list_view    | 認証済み       |
| match_detail_view  | 認証済み       |

---

# 16. トランザクション境界

各処理の詳細な手順は `07_APISequence.md`、入出力は `04_BackendInterface.md` を参照する。

| 処理      | 単一トランザクションで実施する内容                                                                     |
| ------- | --------------------------------------------------------------------------------------- |
| チーム作成   | `teams` INSERT → `team_members` INSERT（LEADER）→ `audit_logs` INSERT                      |
| 招待受諾    | 人数再確認 → `team_members` INSERT → `team_invites` UPDATE（USED）                              |
| マッチ成立   | 待機チーム取得（排他）→ `matches` INSERT → `matching_queue` DELETE ×2 → `audit_logs` INSERT         |
| 勝利申告    | `matches` UPDATE（楽観ロック）→ `audit_logs` INSERT                                            |
| 承認      | `matches` UPDATE → `rating_history` INSERT ×2 → `teams` UPDATE ×2 → `audit_logs` INSERT  |
| 拒否      | `matches` UPDATE（申告情報のクリアと期限再設定）→ `audit_logs` INSERT                                    |
| 自動解決    | 対象取得（排他）→ 承認またはDRAWNへの遷移 → 必要に応じてレート更新 → `audit_logs` INSERT                            |
| レートリセット | `teams` UPDATE（全件）→ `audit_logs` INSERT                                                  |
| 設定変更    | `system_settings` UPDATE → `audit_logs` INSERT                                           |

途中で失敗した場合はROLLBACKする。

## 16.1 排他制御

マッチ成立および自動解決は、同時実行時の二重処理を防ぐため排他制御を行う。

```sql
-- マッチング処理全体を直列化する
SELECT pg_advisory_xact_lock(hashtext('matchmaking'));

-- または対象行のみをロックする
SELECT * FROM matching_queue
ORDER BY queued_at
FOR UPDATE SKIP LOCKED;
```

自動解決バッチも同様に advisory lock で多重起動を防ぐ。

---

# 17. Seedデータ

```text
system_settings
  id = 1
  team_max_members        = 3
  initial_rating          = 1500
  rating_k                = 32
  match_rating_range      = 400
  invite_expiration_hours = 24
  report_timeout_minutes  = 60
  approve_timeout_minutes = 10
  max_reject_count        = 2
```

初期管理者は、対象利用者のログイン後に `profiles.is_admin = TRUE` をMigrationまたは手動操作で設定する。

---

# 18. Migration方針

Migrationは追加方式とし、適用済みのMigrationを編集しない。

作成順序は以下とする。

```text
auth（Supabase標準）
  ↓
共通Function（update_updated_at・auth_is_admin）
  ↓
profiles → teams → team_members → team_invites
  ↓
matching_queue → matches → rating_history
  ↓
system_settings → audit_logs
  ↓
View
  ↓
Trigger
  ↓
RLS
  ↓
Seed
```

`auth_is_admin()` は `profiles` を参照するため、`profiles` 作成後に定義する。

---

# 19. DB更新経路

| テーブル            | 更新経路                             |
| --------------- | -------------------------------- |
| profiles        | クライアントから直接更新可（本人のみ・`is_admin` を除く） |
| 上記以外のすべて        | Edge Functions のみ                |

クライアントから複雑な更新を行ってはならない。

---

# 20. 将来拡張方針

既存テーブルの破壊的変更は行わず、新規テーブル追加を基本方針とする。

将来追加を想定するテーブル。

```text
notifications
chat_messages
seasons
season_matches
discord_webhooks
appeals
statistics
```

`13_FutureFeatures.md` に記載された機能はMVPでは実装しない。

---

# 21. AI実装ガイドライン

* Supabase PostgreSQL を前提とする。
* UUID主キー・RLS必須。
* ビジネスロジックはEdge Functions（TypeScript）で実装し、DB関数へ集約しない。
* 更新系処理はEdge FunctionsからDB直結で行い、明示的にトランザクションを制御する。
* クライアントから複雑な更新を行わない。
* Viewを積極的に利用する。
* データ整合性はDB制約で保証する。
* 状態遷移は 7.1 の遷移表以外を実装してはならない。
* 導出可能な状態を列として保持してはならない。
