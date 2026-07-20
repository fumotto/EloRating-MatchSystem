# 03_Database.md

# 固定チームレート戦 戦績管理システム

## データベース設計書

Version 1.0 (MVP)

---

# 1. 目的

本書は、本システムで利用するデータベースの論理設計・物理設計を定義する。

本設計書は、人間向けの設計資料であると同時に、AIコーディングエージェント（ChatGPT・Gemini・Claude・Continue・Cline等）が実装可能な粒度で記述する。

対象DBMSは PostgreSQL（Supabase）とする。

---

# 2. 設計方針

## 2.1 基本方針

本システムでは以下を設計方針とする。

* PostgreSQL標準機能を積極的に利用する
* UUIDを主キーとして採用する
* 外部キー制約を必ず設定する
* データ整合性をDB側で保証する
* アプリケーション側ではなくRLSによって認可を行う
* Edge Functionsを利用してビジネスロジックを実装する

---

## 2.2 データ管理方針

データは以下の分類で管理する。

### マスタデータ

更新頻度が低いデータ。

例

* システム設定

---

### トランザクションデータ

日々更新されるデータ。

例

* 試合
* レート履歴
* マッチング

---

### 派生データ

他データから算出可能な情報。

例

* 勝率
* 順位
* 勝数
* 敗数

派生データは可能な限りViewで提供する。

---

## 2.3 正規化

MVPでは第三正規形（3NF）を基本とする。

ただし、性能上必要となる項目については冗長化を認める。

現時点では以下を冗長化対象とする。

* teams.rating

これはランキング高速化を目的とする。

---

## 2.4 削除方針

原則として物理削除を行わない。

例外

* matching_queue

のみ削除を許可する。

試合履歴・レート履歴は永続保存する。

---

## 2.5 トランザクション

以下の更新は必ず単一トランザクションとする。

* 試合終了
* レート更新
* ランキング更新
* 履歴保存

途中で失敗した場合はロールバックする。

---

# 3. 命名規則

## 3.1 テーブル名

* 複数形
* snake_case
* 英語

例

```text
profiles
teams
matches
rating_history
```

---

## 3.2 カラム名

snake_case を採用する。

例

```text
created_at
updated_at
winner_team_id
```

---

## 3.3 主キー

すべて

```text
id
```

とする。

型

```text
UUID
```

---

## 3.4 外部キー

命名

```text
<table>_id
```

例

```text
team_id
profile_id
match_id
```

---

## 3.5 日時

日時型はすべて

```text
TIMESTAMPTZ
```

とする。

共通カラム

```text
created_at
updated_at
```

必要に応じて

```text
started_at
finished_at
joined_at
reported_at
approved_at
```

を利用する。

---

## 3.6 真偽値

Boolean は

```text
is_xxx
has_xxx
```

を採用する。

例

```text
is_banned
```

---

## 3.7 状態

状態は Enum 相当のTEXT + CHECK制約で管理する。

例

```text
status
role
```

PostgreSQL Enum型は将来的な状態追加時のマイグレーション負荷が高いため、MVPでは採用しない。

---

# 4. 共通ルール

## 4.1 UUID

すべての主キーはUUIDを利用する。

UUID生成はPostgreSQL側で行う。

---

## 4.2 created_at

全テーブル必須。

DEFAULT

```sql
now()
```

---

## 4.3 updated_at

更新対象テーブルのみ保持する。

更新はTriggerで自動更新する。

---

## 4.4 NULL

NULLは必要最小限のみ許可する。

NULL許可項目は必ず理由を記載する。

---

## 4.5 CHECK制約

状態管理を行う列はCHECK制約を設定する。

例

```sql
status IN (
  'MATCHED',
  'PLAYING',
  'WINNER_REPORTED',
  'COMPLETED'
)
```

---

## 4.6 UNIQUE制約

一意性が必要なデータには必ずUNIQUE制約を設定する。

例

* Steam ID
* マッチングキューのteam_id

---

# 5. テーブル一覧

| テーブル            | 種別          | 説明      |
| --------------- | ----------- | ------- |
| profiles        | Master      | プレイヤー   |
| teams           | Master      | チーム     |
| team_members    | Relation    | チーム所属   |
| matching_queue  | Transaction | マッチング待機 |
| matches         | Transaction | 試合      |
| rating_history  | Transaction | レート履歴   |
| system_settings | Master      | システム設定  |

---

# 6. ER図（論理）

```text
profiles
    │
    │1:N
    │
team_members
    │
    │N:1
    │
teams
    │
    │1:N
    │
matches
    │
    │1:N
    │
rating_history
```

※ `matches` はMVPでは2チーム固定戦を前提とするため、`team_a_id`・`team_b_id` を保持する。将来的にリーグ戦やBO3へ対応する場合は `match_teams` テーブルへ分離する。

---

# 7. 共通インデックス方針

インデックスは以下の基準で作成する。

* 主キー
* 外部キー
* UNIQUE列
* 検索条件
* ORDER BY対象

不要なインデックスは作成しない。

---

# 8. Row Level Security 方針

すべての業務テーブルでRLSを有効化する。

認可は以下を原則とする。

| 操作     | 判定主体 |
| ------ | ---- |
| SELECT | RLS  |
| INSERT | RLS  |
| UPDATE | RLS  |
| DELETE | RLS  |

アプリケーション側では権限判定を補助的に行うが、最終的な認可は必ずRLSで保証する。

---

# 9. Edge Functions 方針

整合性が重要な処理は、クライアントから直接更新しない。

以下は必ずEdge Functions経由とする。

* 試合開始
* 勝利申告
* 敗者承認
* レート更新
* 試合完了
* 管理者操作

プロフィール取得やランキング取得などの読み取り系は、RLSで保護されたテーブル・ビューから直接取得する。

---

# 10. 将来拡張方針

以下を追加できる設計とする。

* シーズン
* Discord連携
* トーナメント
* 観戦機能
* チャット
* 通知
* API公開
* 大会運営機能

既存テーブルの破壊的変更は行わず、新規テーブル追加を基本方針とする。

system_settings
--------------

id
team_max_members
initial_rating
rating_k
updated_at

* system_settings は 必ず1レコードのみ保持する。
* id = 1 を固定値とする。
* アプリケーション起動時に初期データ（Seed）として投入する。
* 設定変更は管理者のみ可能。

# 03_Database.md

## Part2

# Table: profiles

## 概要

Steam認証されたプレイヤー情報を保持する。

Supabase Auth (`auth.users`) と 1:1 で対応する。

本テーブルはアプリケーション内で利用するプロフィール情報を管理する。

---

## テーブル情報

| 項目          | 内容       |
| ----------- | -------- |
| Table Name  | profiles |
| 種別          | Master   |
| Primary Key | id       |
| 更新頻度        | 低        |
| RLS         | 有効       |

---

## Columns

| Column       | Type        | NULL | PK | UK | Default    | Description           |
| ------------ | ----------- | ---- | -- | -- | ---------- | --------------------- |
| id           | UUID        | No   | ✓  |    | auth.uid() | Supabase Auth User ID |
| steam_id     | TEXT        | No   |    | ✓  |            | Steam ID (64bit)      |
| display_name | TEXT        | No   |    |    |            | 表示名                   |
| avatar_url   | TEXT        | Yes  |    |    |            | SteamアイコンURL          |
| created_at   | TIMESTAMPTZ | No   |    |    | now()      | 作成日時                  |
| updated_at   | TIMESTAMPTZ | No   |    |    | now()      | 更新日時                  |

---

## Constraints

### Primary Key

```text
PK_profiles
(id)
```

---

### Unique

```text
UX_profiles_steam_id
(steam_id)
```

---

### Foreign Key

```text
profiles.id

↓

auth.users.id
```

---

## Indexes

```text
UX_profiles_steam_id
```

---

## Trigger

updated_at を自動更新する。

```sql
BEFORE UPDATE
```

---

## RLS

### SELECT

認証済みユーザー全員

---

### INSERT

本人のみ

```text
auth.uid() = id
```

---

### UPDATE

本人のみ

---

### DELETE

禁止

---

## 運用ルール

* Steamログイン時に自動作成する。
* Steamプロフィール更新時は display_name・avatar_url を同期する。
* 削除は行わない。

---

# Table: teams

## 概要

固定チームを管理する。

レーティングはチーム単位で保持する。

チームオーナーは team_members.role = OWNER により管理する。

---

## テーブル情報

| 項目          | 内容     |
| ----------- | ------ |
| Table Name  | teams  |
| 種別          | Master |
| Primary Key | id     |
| RLS         | 有効     |

---

## Columns

| Column     | Type        | NULL | PK | Default           | Description |
| ---------- | ----------- | ---- | -- | ----------------- | ----------- |
| id         | UUID        | No   | ✓  | gen_random_uuid() | チームID       |
| name       | TEXT        | No   |    |                   | チーム名        |
| rating     | INTEGER     | No   |    | 1500              | 現在レート       |
| is_banned  | BOOLEAN     | No   |    | FALSE             | BAN状態       |
| created_at | TIMESTAMPTZ | No   |    | now()             | 作成日時        |
| updated_at | TIMESTAMPTZ | No   |    | now()             | 更新日時        |

---

## Constraints

### Primary Key

```text
PK_teams
(id)
```

---

### Unique

```text
UX_teams_name
(name)
```

チーム名は重複不可。

---

### Check

```text
rating >= 0
```

---

## Indexes

ランキング取得

```text
IX_teams_rating_desc
(rating DESC)
```

BAN検索

```text
IX_teams_is_banned
(is_banned)
```

---

## Trigger

updated_at 自動更新

---

## RLS

### SELECT

全員

---

### INSERT

認証済みユーザー

---

### UPDATE

チームオーナー

または

管理者

---

### DELETE

禁止

---

## 運用ルール

* チーム削除は行わない。
* BAN時は is_banned を更新する。
* レート更新は Edge Functions のみ実施する。
* チーム名変更は MVP 対象外。

---

# Table: team_members

## 概要

プレイヤーとチームの所属関係を管理する。

OWNER 権限をここで管理する。

---

## テーブル情報

| 項目          | 内容           |
| ----------- | ------------ |
| Table Name  | team_members |
| 種別          | Relation     |
| Primary Key | id           |
| RLS         | 有効           |

---

## Columns

| Column     | Type        | NULL | PK | Default           | Description |         |
| ---------- | ----------- | ---- | -- | ----------------- | ----------- | ------- |
| id         | UUID        | No   | ✓  | gen_random_uuid() | ID          |         |
| team_id    | UUID        | No   |    |                   |             | 所属チーム   |
| profile_id | UUID        | No   |    |                   |             | 所属プレイヤー |
| role       | TEXT        | No   |    | 'MEMBER'          | 権限          |         |
| joined_at  | TIMESTAMPTZ | No   |    | now()             | 参加日時        |         |

---

## Constraints

### Primary Key

```text
PK_team_members
(id)
```

---

### Foreign Keys

```text
team_id

↓

teams.id
```

```text
profile_id

↓

profiles.id
```

---

### Unique

1人は1チームのみ所属可能

```text
UX_team_members_profile
(profile_id)
```

同一チームへの重複参加禁止

```text
UX_team_members_team_profile
(team_id, profile_id)
```

※ `profile_id` が一意であるため複合UNIQUEは冗長ですが、ビジネスルールを明示する目的で定義してもよい。

---

### Check

role

```text
OWNER

MEMBER
```

---

## Indexes

```text
IX_team_members_team
(team_id)
```

```text
IX_team_members_profile
(profile_id)
```

---

## RLS

### SELECT

認証済みユーザー

---

### INSERT

Edge Functions のみ

---

### UPDATE

チームオーナー

または

管理者

---

### DELETE

チームオーナー

または

管理者

---

## 運用ルール

チーム作成時

```text
teams 作成

↓

team_members 作成

↓

role = OWNER
```

1チームにつき OWNER は必ず1人存在する。

OWNER が退会する場合は、先に別メンバーへ OWNER を移譲する。

チーム人数は

```text
system_settings.team_max_members
```

を超えてはならない。

人数チェックは Edge Functions で行う。

---

# テーブル間ルール

## profiles

↓

team_members

1 : 1

（MVPでは1プレイヤー1チーム）

---

## teams

↓

team_members

1 : N

---

## OWNER制約

1チームに OWNER は必ず1人存在する。

OWNER が存在しない状態は許可しない。

OWNER は MEMBER に変更する前に、別メンバーを OWNER に変更する必要がある。

このルールは Edge Functions で保証する。

---

# AI実装メモ

* `updated_at` は共通トリガーを利用する。
* UUID は `gen_random_uuid()` を利用する。
* `profiles.id` は `auth.users.id` と同一値を使用する。
* RLS を有効化した状態でマイグレーションを作成する。
* チーム作成・参加・脱退・オーナー移譲は、すべて Edge Functions 経由で実装する。

# 03_Database.md

# 03_Database.md

## Part3

# Table: matching_queue

## 概要

現在マッチング待機中のチームを管理するワークテーブル。

履歴は保持しない。

マッチ成立時またはキャンセル時に削除する。

将来的にRedis等へ移行しやすい構造とする。

---

## テーブル情報

| 項目          | 内容             |
| ----------- | -------------- |
| Table Name  | matching_queue |
| 種別          | Work           |
| Primary Key | team_id        |
| 更新頻度        | 非常に高い          |
| RLS         | 有効             |

---

## Columns

| Column    | Type        | NULL | PK | Default | Description |
| --------- | ----------- | ---- | -- | ------- | ----------- |
| team_id   | UUID        | No   | ✓  |         | 待機中チーム      |
| queued_at | TIMESTAMPTZ | No   |    | now()   | 待機開始日時      |

---

## Constraints

### Primary Key

```text
PK_matching_queue
(team_id)
```

---

### Foreign Key

```text
team_id

↓

teams.id
```

---

## Indexes

```text
IX_matching_queue_queued_at
(queued_at)
```

---

## RLS

### SELECT

認証済みユーザー

---

### INSERT

チームオーナーのみ

---

### DELETE

チームオーナー

または

Edge Functions

---

### UPDATE

禁止

---

## 運用ルール

1チームにつき1件のみ存在する。

待機中チームは

* 試合開始
* マッチ成立
* キャンセル

のいずれかで削除する。

マッチングアルゴリズムは Edge Functions が担当する。

---

# Table: matches

## 概要

試合情報を管理する。

本システムの中核テーブル。

勝敗確定・状態遷移・レーティング更新はすべてこのテーブルを起点とする。

---

## テーブル情報

| 項目          | 内容          |
| ----------- | ----------- |
| Table Name  | matches     |
| 種別          | Transaction |
| Primary Key | id          |
| 更新頻度        | 高           |
| RLS         | 有効          |

---

## Columns

| Column                 | Type        | NULL | PK | Default           | Description |        |
| ---------------------- | ----------- | ---- | -- | ----------------- | ----------- | ------ |
| id                     | UUID        | No   | ✓  | gen_random_uuid() | 試合ID        |        |
| team_a_id              | UUID        | No   |    |                   |             | チームA   |
| team_b_id              | UUID        | No   |    |                   |             | チームB   |
| winner_team_id         | UUID        | Yes  |    |                   |             | 勝者     |
| status                 | TEXT        | No   |    | 'MATCHED'         | 状態          |        |
| reported_by_profile_id | UUID        | Yes  |    |                   |             | 勝利申告者  |
| reported_at            | TIMESTAMPTZ | Yes  |    |                   |             | 勝利申告日時 |
| approved_by_profile_id | UUID        | Yes  |    |                   |             | 敗者承認者  |
| approved_at            | TIMESTAMPTZ | Yes  |    |                   |             | 承認日時   |
| version                | INTEGER     | No   |    | 1                 | 楽観ロック       |        |
| started_at             | TIMESTAMPTZ | Yes  |    |                   |             | 試合開始   |
| finished_at            | TIMESTAMPTZ | Yes  |    |                   |             | 試合終了   |
| created_at             | TIMESTAMPTZ | No   |    | now()             | 作成日時        |        |

---

## Constraints

### Primary Key

```text
PK_matches
(id)
```

---

### Foreign Keys

```text
team_a_id
↓

teams.id
```

```text
team_b_id
↓

teams.id
```

```text
winner_team_id
↓

teams.id
```

```text
reported_by_profile_id
↓

profiles.id
```

```text
approved_by_profile_id
↓

profiles.id
```

---

### Check

状態

```text
MATCHED

PLAYING

WINNER_REPORTED

COMPLETED
```

---

勝者

```text
winner_team_id

IS NULL

または

team_a_id

または

team_b_id
```

---

version

```text
>=1
```

---

team_a

≠

team_b

---

## Indexes

試合一覧

```text
IX_matches_created
(created_at DESC)
```

---

状態検索

```text
IX_matches_status
(status)
```

---

チーム検索

```text
IX_matches_team_a
(team_a_id)
```

```text
IX_matches_team_b
(team_b_id)
```

---

## 状態遷移

```text
MATCHED

↓

PLAYING

↓

WINNER_REPORTED

↓

COMPLETED
```

逆遷移は禁止。

---

## RLS

### SELECT

認証済みユーザー

---

### INSERT

Edge Functions

---

### UPDATE

Edge Functions

---

### DELETE

禁止

---

## 運用ルール

試合作成

↓

status=MATCHED

---

試合開始

↓

PLAYING

---

勝者申告

↓

WINNER_REPORTED

---

敗者承認

↓

COMPLETED

---

COMPLETED 後は更新不可。

管理者操作のみ例外。

---

## 楽観ロック

version を利用する。

更新例

```sql
UPDATE matches
SET
    status='PLAYING',
    version=version+1
WHERE
    id=:match_id
AND
    version=:current_version;
```

更新件数

0件

の場合

同時更新エラーとする。

---

## トランザクション

敗者承認時

以下を1トランザクションで実施する。

```text
matches更新

↓

rating_history追加

↓

teams.rating更新

↓

COMMIT
```

途中で失敗した場合

ROLLBACK

---

## 不変条件

以下は常に成立すること。

・team_a_id ≠ team_b_id

・winner_team_id は team_a または team_b

・status=COMPLETED の場合

finished_at は必須

---

・status=WINNER_REPORTED の場合

reported_by_profile_id

reported_at

winner_team_id

は必須

---

・status=COMPLETED の場合

approved_by_profile_id

approved_at

も必須

---

## AI実装メモ

勝敗確定時に直接 teams を更新してはならない。

必ず

MatchService

↓

RatingService

↓

Transaction

の順で処理する。

version を利用して競合更新を防止する。

クライアントから UPDATE は許可しない。

すべて Edge Functions 経由で更新する。

## Part4

# Table: rating_history

## 概要

チームレーティングの更新履歴を保持する。

レートは試合が **COMPLETED** になった時点で更新される。

1試合につき2件（両チーム分）の履歴を登録する。

履歴は削除・更新しない。

監査データとして永続保存する。

---

## テーブル情報

| 項目          | 内容             |
| ----------- | -------------- |
| Table Name  | rating_history |
| 種別          | Transaction    |
| Primary Key | id             |
| 更新頻度        | 中              |
| RLS         | 有効             |

---

## Columns

| Column        | Type        | NULL | PK | Default           | Description |            |
| ------------- | ----------- | ---- | -- | ----------------- | ----------- | ---------- |
| id            | UUID        | No   | ✓  | gen_random_uuid() | 履歴ID        |            |
| match_id      | UUID        | No   |    |                   |             | 対象試合       |
| team_id       | UUID        | No   |    |                   |             | 対象チーム      |
| before_rating | INTEGER     | No   |    |                   |             | 更新前レート     |
| after_rating  | INTEGER     | No   |    |                   |             | 更新後レート     |
| rating_change | INTEGER     | No   |    |                   |             | 増減値        |
| result        | TEXT        | No   |    |                   |             | WIN / LOSE |
| completed_at  | TIMESTAMPTZ | No   |    |                   |             | 試合確定日時     |
| created_at    | TIMESTAMPTZ | No   |    | now()             | 登録日時        |            |

---

## Constraints

### Primary Key

```text
PK_rating_history
(id)
```

---

### Foreign Keys

```text
match_id

↓

matches.id
```

```text
team_id

↓

teams.id
```

---

### Check

result

```text
WIN

LOSE
```

---

after_rating

```text
>= 0
```

---

## Unique

```text
(match_id, team_id)
```

1試合につき1チーム1件のみ。

---

## Indexes

履歴取得

```text
(team_id, completed_at DESC)
```

---

試合検索

```text
(match_id)
```

---

ランキング再計算

```text
(completed_at DESC)
```

---

## RLS

### SELECT

全員

---

### INSERT

Edge Functions

---

### UPDATE

禁止

---

### DELETE

禁止

---

## 運用ルール

試合確定後

```text
matches

↓

status=COMPLETED

↓

completed_at設定

↓

rating_history登録

↓

teams.rating更新
```

履歴は変更しない。

---

## AI実装メモ

rating_change は

```text
after_rating

-

before_rating
```

を保存する。

SQLで毎回計算しない。

---

# Table: system_settings

## 概要

システム全体の設定を保持する。

本テーブルは **必ず1レコードのみ** 保持する。

初期データ（Seed）として登録する。

---

## テーブル情報

| 項目          | 内容              |
| ----------- | --------------- |
| Table Name  | system_settings |
| 種別          | Master          |
| Primary Key | id              |

---

## Columns

| Column           | Type        | NULL | PK | Default | Description |
| ---------------- | ----------- | ---- | -- | ------- | ----------- |
| id               | INTEGER     | No   | ✓  | 1       | 固定値         |
| team_max_members | INTEGER     | No   |    | 3       | チーム人数上限     |
| initial_rating   | INTEGER     | No   |    | 1500    | 初期レート       |
| rating_k         | INTEGER     | No   |    | 32      | K値          |
| updated_at       | TIMESTAMPTZ | No   |    | now()   | 更新日時        |

---

## Constraints

Primary Key

```text
id = 1
```

---

## Check

team_max_members > 1

rating_k > 0

initial_rating >= 0

---

## RLS

SELECT

全員

---

UPDATE

管理者

---

INSERT

禁止

---

DELETE

禁止

---

## AI実装メモ

更新対象は

id=1

固定。

---

# View: team_ranking_view

## 概要

ランキング表示専用ビュー。

画面からは本Viewを参照する。

---

## Columns

| Column    | Description |
| --------- | ----------- |
| team_id   | チーム         |
| team_name | チーム名        |
| rating    | 現在レート       |
| wins      | 勝利数         |
| losses    | 敗北数         |
| matches   | 試合数         |
| win_rate  | 勝率          |

---

## 集計ルール

wins

```text
rating_history

result=WIN
```

---

losses

```text
result=LOSE
```

---

matches

```text
wins

+

losses
```

---

win_rate

```text
wins

/

matches
```

---

並び順

```text
rating DESC

wins DESC

team_name ASC
```

---

## RLS

teams に従う。

---

## AI実装メモ

画面は teams を直接参照しない。

ランキング画面は

team_ranking_view

のみ取得する。

Viewに集約することで、

将来的にシーズン制へ変更しても画面側の実装を変更しなくてよい。

# 03_Database.md

## Part5

# 11. 外部キー一覧

本システムで利用する外部キーを一覧化する。

| Table          | Column                 | References    | ON DELETE | ON UPDATE |
| -------------- | ---------------------- | ------------- | --------- | --------- |
| profiles       | id                     | auth.users.id | CASCADE   | CASCADE   |
| team_members   | team_id                | teams.id      | RESTRICT  | CASCADE   |
| team_members   | profile_id             | profiles.id   | RESTRICT  | CASCADE   |
| matching_queue | team_id                | teams.id      | CASCADE   | CASCADE   |
| matches        | team_a_id              | teams.id      | RESTRICT  | CASCADE   |
| matches        | team_b_id              | teams.id      | RESTRICT  | CASCADE   |
| matches        | winner_team_id         | teams.id      | RESTRICT  | CASCADE   |
| matches        | reported_by_profile_id | profiles.id   | RESTRICT  | CASCADE   |
| matches        | approved_by_profile_id | profiles.id   | RESTRICT  | CASCADE   |
| rating_history | match_id               | matches.id    | RESTRICT  | CASCADE   |
| rating_history | team_id                | teams.id      | RESTRICT  | CASCADE   |

---

# 12. インデックス一覧

## profiles

```text
UX_profiles_steam_id
```

---

## teams

```text
UX_teams_name
IX_teams_rating_desc
IX_teams_is_banned
```

---

## team_members

```text
UX_team_members_profile
IX_team_members_team
IX_team_members_profile
```

---

## matching_queue

```text
IX_matching_queue_queued_at
```

---

## matches

```text
IX_matches_created
IX_matches_status
IX_matches_team_a
IX_matches_team_b
```

---

## rating_history

```text
UX_rating_history_match_team
IX_rating_history_team_completed
IX_rating_history_match
IX_rating_history_completed
```

---

# 13. 共通Trigger

## updated_at

対象

* profiles
* teams
* system_settings

更新時

```sql
updated_at = now()
```

を自動設定する。

---

# 14. 共通Function

## update_updated_at()

目的

updated_at を更新する。

利用

```text
BEFORE UPDATE
```

---

## increment_match_version()

目的

楽観ロック管理

更新時

```text
version = version + 1
```

---

## calculate_rating_change()

目的

Elo計算

入力

* teamA
* teamB
* winner
* K値

戻り値

* ratingA
* ratingB

本Functionは Edge Functions から利用する。

---

# 15. Row Level Security

すべてのテーブルで RLS を有効化する。

---

## profiles

| 操作     | 許可   |
| ------ | ---- |
| SELECT | 認証済み |
| INSERT | 本人   |
| UPDATE | 本人   |
| DELETE | 禁止   |

---

## teams

| 操作     | 許可        |
| ------ | --------- |
| SELECT | 全員        |
| INSERT | 認証済み      |
| UPDATE | OWNER・管理者 |
| DELETE | 禁止        |

---

## team_members

| 操作     | 許可             |
| ------ | -------------- |
| SELECT | 認証済み           |
| INSERT | Edge Functions |
| UPDATE | Edge Functions |
| DELETE | Edge Functions |

---

## matching_queue

| 操作     | 許可             |
| ------ | -------------- |
| SELECT | 認証済み           |
| INSERT | Edge Functions |
| DELETE | Edge Functions |

---

## matches

| 操作     | 許可             |
| ------ | -------------- |
| SELECT | 認証済み           |
| INSERT | Edge Functions |
| UPDATE | Edge Functions |
| DELETE | 禁止             |

---

## rating_history

| 操作     | 許可             |
| ------ | -------------- |
| SELECT | 認証済み           |
| INSERT | Edge Functions |
| UPDATE | 禁止             |
| DELETE | 禁止             |

---

## system_settings

| 操作     | 許可   |
| ------ | ---- |
| SELECT | 認証済み |
| UPDATE | 管理者  |

---

# 16. トランザクション

以下は必ず単一トランザクションで実施する。

---

## チーム作成

```text
teams

↓

team_members(OWNER)

↓

COMMIT
```

---

## マッチ成立

```text
matching_queue削除

↓

matches作成

↓

COMMIT
```

---

## 試合開始

```text
matches.status

↓

PLAYING
```

---

## 勝利申告

```text
winner_team_id

reported_by_profile_id

reported_at

status=WINNER_REPORTED
```

---

## 敗者承認

```text
completed_at

↓

rating_history登録

↓

teams.rating更新

↓

matches.status=COMPLETED

↓

COMMIT
```

途中で失敗した場合

ROLLBACK

---

# 17. Seedデータ

system_settings

```text
id = 1

team_max_members = 3

initial_rating = 1500

rating_k = 32
```

---

管理者

```text
初期管理者は手動登録
```

---

# 18. Migration方針

Migrationは以下の順序で作成する。

```text
auth

↓

profiles

↓

teams

↓

team_members

↓

matching_queue

↓

matches

↓

rating_history

↓

system_settings

↓

View

↓

Trigger

↓

Function

↓

RLS
```

---

# 19. DB更新ルール

クライアントから更新可能

```text
profiles
```

---

Edge Functions経由

```text
team_members

matching_queue

matches

rating_history

teams.rating

system_settings
```

---

# 20. MVP対象テーブル

本バージョンで利用するテーブル

```text
profiles

teams

team_members

matching_queue

matches

rating_history

system_settings
```

---

将来追加予定

```text
notifications

chat_messages

seasons

season_matches

audit_logs

discord_webhooks

appeals

statistics
```

---

# AI実装ガイドライン

本設計は以下を前提とする。

・Supabase PostgreSQL

・UUID主キー

・RLS必須

・Edge Functionsで業務ロジック実装

・クライアントから複雑な更新は禁止

・Viewを積極利用

・データ整合性はDB側で保証する

# 追記（Version 1.1）

## Table: team_invites

### 概要

チームへの参加招待を管理する。

チーム参加は招待制とし、オーナーが発行した招待コードを利用して参加する。

有効な招待は **1チームにつき1件まで** とする。

将来的な Discord 招待・QRコード招待・期限付きURL に拡張可能な設計とする。

---

## テーブル情報

| 項目          | 内容           |
| ----------- | ------------ |
| Table Name  | team_invites |
| 種別          | Transaction  |
| Primary Key | id           |
| RLS         | 有効           |

---

## Columns

| Column                | Type        | NULL | PK | Default           | Description |                |
| --------------------- | ----------- | ---- | -- | ----------------- | ----------- | -------------- |
| id                    | UUID        | No   | ✓  | gen_random_uuid() | 招待ID        |                |
| team_id               | UUID        | No   |    |                   |             | 対象チーム          |
| invite_code           | TEXT        | No   |    |                   |             | 招待コード（ランダム文字列） |
| created_by_profile_id | UUID        | No   |    |                   |             | 発行者（OWNER）     |
| status                | TEXT        | No   |    | 'ACTIVE'          | 招待状態        |                |
| expires_at            | TIMESTAMPTZ | No   |    |                   |             | 有効期限           |
| used_at               | TIMESTAMPTZ | Yes  |    |                   |             | 利用日時           |
| created_at            | TIMESTAMPTZ | No   |    | now()             | 作成日時        |                |

---

## Constraints

### Primary Key

```text
PK_team_invites
(id)
```

---

### Foreign Keys

```text
team_id

↓

teams.id
```

```text
created_by_profile_id

↓

profiles.id
```

---

### Unique

```text
UX_team_invites_invite_code
(invite_code)
```

招待コードはシステム全体で一意とする。

---

### Check

status

```text
ACTIVE

USED

EXPIRED

REVOKED
```

---

expires_at

```text
expires_at > created_at
```

---

## Indexes

招待コード検索

```text
IX_team_invites_invite_code
(invite_code)
```

---

チーム検索

```text
IX_team_invites_team
(team_id)
```

---

期限切れ招待のクリーンアップ

```text
IX_team_invites_expires_at
(expires_at)
```

---

## RLS

### SELECT

認証済みユーザー

---

### INSERT

Edge Functions のみ

---

### UPDATE

Edge Functions のみ

---

### DELETE

禁止

---

## 運用ルール

* チームオーナーのみ招待を発行できる。
* 有効な招待が存在する場合は、新規作成せず既存の招待を返却する。
* 招待コードの利用時に、チーム人数上限・BAN状態・有効期限を再確認する。
* 招待利用後は `status = USED` とし、`used_at` を設定する。
* 招待取り消し時は `status = REVOKED` とする。
* 期限切れの招待は `status = EXPIRED` として扱う。定期ジョブで更新するか、参照時に期限切れと判定する。

---

## AI実装メモ

* `invite_code` は暗号学的に安全なランダム文字列（128bit以上のエントロピーを推奨）を生成する。
* 招待URLは `invite_code` をクライアントへ返却し、URLの組み立てはフロントエンドで行う。
* `accept-team-invite` 実行時は、トランザクション内でチーム人数を再確認し、競合による定員超過を防止する。
* 同一チームにつき `ACTIVE` 状態の招待は1件のみ保持することを運用ルールとし、Edge Functions で保証する。

## また、下記Viewも実装する

* team_detail_view
* match_list_view
* match_detail_view
