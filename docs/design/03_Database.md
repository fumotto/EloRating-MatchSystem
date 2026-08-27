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
| 監査データ       | 追記専用の記録（下記の例外あり） | `audit_logs`                                  |
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
| 真偽値     | `is_xxx` / `has_xxx`   | `is_banned`、`auto_approved`    |
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
| abuse_reports   | Transaction | 通報          |
| match_avoidance | Work        | ペアの再マッチ抑止   |

シーズン関連のテーブル（`seasons` / `season_rankings` / `season_members` / `season_exports`）は 18.9 に定義する。

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

本表を試合状態の唯一の正本とする（ADR-008、ADR-014、ADR-032、ADR-034）。

| 遷移元             | 遷移先             | 契機                    | 実行主体                 | 更新される列                                                                    |
| --------------- | --------------- | --------------------- | -------------------- | ------------------------------------------------------------------------- |
| （新規）            | PLAYING         | マッチ成立                 | matchmaker           | `started_at`、`report_deadline_at`                                         |
| PLAYING         | PLAYING         | 報告期限の延長               | いずれかのチームのメンバー        | `report_deadline_at`、`report_extension_count`+1                           |
| PLAYING         | PLAYING         | 不成立の申請／その解決（承諾以外）     | いずれかのチームのメンバー        | `no_contest_requested_*`、`no_contest_request_count`                       |
| PLAYING         | COMPLETED       | **投了（基本の経路）**         | 敗者チームのメンバー           | `winner_team_id`、`approved_at`、`completed_at`                             |
| PLAYING         | WINNER_REPORTED | 勝利申告（代替の経路）           | 勝者チームのメンバー           | `winner_team_id`、`reported_by_profile_id`、`reported_at`、`approve_deadline_at` |
| PLAYING         | DRAWN           | 報告期限切れ                | auto-resolve-matches | `completed_at`、`no_contest_reason`=`REPORT_TIMEOUT`                       |
| PLAYING         | DRAWN           | 不成立の申請へ相手が無応答          | auto-resolve-matches | `completed_at`、`no_contest_reason`=`NO_SHOW`                              |
| PLAYING         | DRAWN           | 不成立の申請を相手が承諾           | 相手チームのメンバー           | `completed_at`、`no_contest_reason`=`MUTUAL`                               |
| WINNER_REPORTED | WINNER_REPORTED | 反対申告                  | 相手チームのメンバー           | `counter_claim_team_id`、`counter_claimed_at`                              |
| WINNER_REPORTED | COMPLETED       | 承認／投了                 | 敗者チームのメンバー           | `approved_by_profile_id`、`approved_at`、`completed_at`                     |
| WINNER_REPORTED | COMPLETED       | 承認期限切れによる自動承認         | auto-resolve-matches | `auto_approved`、`approved_at`、`completed_at`                              |
| WINNER_REPORTED | DRAWN           | 反対申告が解けないまま承認期限切れ     | auto-resolve-matches | `winner_team_id`=NULL、`completed_at`、`no_contest_reason`=`CONFLICT`       |
| PLAYING / WINNER_REPORTED | DRAWN | 管理者による無効化            | 管理者                  | `winner_team_id`=NULL、`completed_at`、`no_contest_reason`=`ADMIN_VOID`     |

`COMPLETED` および `DRAWN` は終端状態であり、以後の更新を行わない。**管理者による訂正も行わない**（ADR-033 ①）。

上表にない遷移はすべて禁止する。逆遷移も禁止する。

`MATCHED` および `IN_PROGRESS` は使用しない。

### 廃止した遷移（ADR-032 ③）

`WINNER_REPORTED → PLAYING`（拒否）および `WINNER_REPORTED → DRAWN`（拒否上限）は**廃止した**。
敗者が単独で `DRAWN` へ到達できる経路であり、レート変動なし・記録なしで試合を消せたためである。
反論の手段は反対申告に置き換わった（ADR-032 ⑩）。

### 自動承認を止める条件

`counter_claim_team_id IS NOT NULL` の間、`auto-resolve-matches` は自動承認を行わない。
矛盾する2つの主張のどちらかを機械的に選ぶ根拠が無いためである。この試合は承認期限の経過により
`DRAWN`（`CONFLICT`）へ落ちる。

---

## 7.2 レート更新の有無

| 状態        | レート更新 | rating_history |
| --------- | ----- | -------------- |
| COMPLETED | あり    | 2件作成           |
| DRAWN     | なし    | 作成しない          |

`DRAWN` は `rating_history` を作成しないため、`team_ranking_view` の**勝敗数と勝率**には計上されない。

一方、**確定率と不戦数は `matches` から集計する**（ADR-032 ⑥）。`rating_history` には `DRAWN` の行が
存在しないため、既存の集計元では不戦を数えられない。計上の可否は `no_contest_reason` により異なる（10.6）。

| no_contest_reason | 確定率の分母へ計上           |
| ----------------- | ------------------- |
| REPORT_TIMEOUT    | 両チーム                |
| NO_SHOW           | 無応答側のみ              |
| CONFLICT          | 両チーム                |
| MUTUAL            | しない（件数は別枠で公開）       |
| ADMIN_VOID        | しない                 |

**確定率の意味は「対戦したのに決着しなかった割合」である。** 対戦そのものが成立しなかった試合
（`MUTUAL` / `ADMIN_VOID`）を混ぜると、回線の相性が悪いだけのチームが不誠実に見える（ADR-034 備考）。

---

## 7.3 Team

チームに状態列は持たない。

| 概念     | 表現方法                                                    |
| ------ | ------------------------------------------------------- |
| BAN状態  | `teams.is_banned`                                       |
| 試合中    | `matches` に終端状態でないレコードが存在するかで導出                         |
| マッチング中 | `matching_queue` にレコードが存在するかで導出                         |

`teams.status` は存在しない。導出可能な状態を列として保持してはならない（二重管理による不整合を防ぐため）。

同時参加の規則は「1チーム同時1試合」ではなく、**「進行中の試合を持つチームは、マッチング待機列に登録できない」**である
（ADR-035）。**保証はアプリケーション層のみで行い、DBに制約を置かない。** 詳細は 10.6「同時参加の制約」を参照。

クールダウン中かどうかも状態列を持たない。`teams.queue_cooldown_until > NOW()` により導出する。

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

管理者は **Supabase Auth の `app_metadata`** で表す（ADR-020）。データベースに管理者フラグの列を持たない。

```text
auth.users.raw_app_meta_data = {"role": "admin"}
```

RLSポリシーでは、JWTのクレームを参照して判定する。

```sql
(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
```

`profiles` を参照しないため、再帰的な評価も SECURITY DEFINER 関数も不要である。

### 付与方法

管理者はSupabaseプロジェクトの運用者が指定する。アプリケーションに管理者を登録・昇格させる機能は存在しない。

```sql
UPDATE auth.users
   SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
 WHERE id = '<user-uuid>';
```

Supabaseダッシュボードまたは Admin API（service_role）でも同じ操作を行える。

### app_metadata を用いる理由

`app_metadata` は `user_metadata` と異なり **service_role でのみ更新可能**である。利用者が自身を管理者へ昇格させることが構造的に不可能であり、RLSポリシーで防ぐ必要がない。

### 反映タイミング

付与は対象利用者のJWTが更新される（再ログインまたはトークンリフレッシュ）まで反映されない。運用手順は `11_Deployment.md` を参照する。

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
| avatar_url       | TEXT        | Yes  |    |         | アイコンURL（プロバイダ側に無い場合があるためNULL可。配信元を限定する。下記参照） |
| created_at       | TIMESTAMPTZ | No   |    | now()   | 作成日時                           |
| updated_at       | TIMESTAMPTZ | No   |    | now()   | 更新日時                           |

管理者フラグの列は持たない。管理者は `app_metadata` で表す（9.1、ADR-020）。

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
```

### Trigger

`update_updated_at()` を BEFORE UPDATE で適用する。

### RLS

| 操作     | 許可                    |
| ------ | --------------------- |
| SELECT | 認証済みユーザー              |
| INSERT | 本人のみ（`auth.uid() = id`） |
| UPDATE | 本人のみ                  |
| DELETE | 禁止                    |

管理者フラグを本テーブルに持たないため、更新可否を列単位で制限する必要はない。

### 運用ルール

* ログイン時に存在しなければ作成する。作成主体は `04_BackendInterface.md` の認証フローで定義する。
* プロバイダ側の情報が更新された場合は `display_name`・`avatar_url` を同期する。

`avatar_url` は `profiles_avatar_url_allowlist`（Migration 0020）で配信元を限定する。
許可するのは Discord・Steam のCDNのみであり、それ以外はNULLとして扱う。

**★本カラムは他の利用者の画面で `<img src>` に載る。** 任意のURLを許すと、
チーム画面を開いただけで閲覧者のIPとUAが指定先のサーバへ渡り、プレイヤー同士の追跡に使える。

**★Edge Function 側の検証だけでは足りない。** `profiles` は本人がクライアントから直接
UPDATEできる（19章）ため、`ensure-profile` を通らない経路がある。DBのCHECK制約を最終の関門とする。
規則は `supabase/functions/_shared/avatarUrl.ts` と同一であり、片方だけを変えてはならない。
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
| queue_cooldown_until | TIMESTAMPTZ | Yes |  |                | 待機列へ入れない期限（無ければNULL） |
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

`queue_cooldown_until` は ADR-032 ④ のクールダウンである。**レートではなく時間で代償を払わせる**ための列であり、
`queue-match` はこの値が未来である間 `QUEUE-006` を返す。過去日時とNULLは同義に扱う（判定は `> NOW()` のみ）。
クールダウンは自動マッチングの入り口にのみ効く。管理者が用意する試合には影響しない（ADR-035 ⑤）。

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
* レート更新は試合の確定処理のみが実施する（`concede-match` / `approve-match` / 自動承認）。
* `queue_cooldown_until` を設定するのは、承認期限切れの自動承認・報告期限切れの解散・解散への無応答・
  1日の上限を超えた合意不成立・反対申告の不調・通報への措置である（ADR-032 ④ / ADR-033 ③）。
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
| reject_count           | INTEGER     | No   |    | 0                 | **廃止**。更新しない（ADR-032 ③）          |
| no_contest_reason      | TEXT        | Yes  |    |                   | `DRAWN` の理由（DRAWN以外はNULL）        |
| counter_claim_team_id  | UUID        | Yes  |    |                   | 反対申告したチーム（ADR-032 ⑩）            |
| counter_claimed_at     | TIMESTAMPTZ | Yes  |    |                   | 反対申告日時                           |
| report_extension_count | INTEGER     | No   |    | 0                 | 報告期限を延長した回数（ADR-032 ⑦）          |
| no_contest_requested_by_team_id | UUID | Yes |  |                   | 不成立を申請したチーム（保留中のみ）              |
| no_contest_requested_at | TIMESTAMPTZ | Yes |  |                   | 不成立の申請日時（保留中のみ）                 |
| no_contest_reason_code | TEXT        | Yes  |    |                   | 不成立の申請理由（保留中のみ）                 |
| no_contest_request_count | INTEGER   | No   |    | 0                 | 不成立を申請した回数（ADR-032 ⑧）           |
| report_deadline_at     | TIMESTAMPTZ | No   |    |                   | 勝利申告の期限                         |
| approve_deadline_at    | TIMESTAMPTZ | Yes  |    |                   | 承認の期限（申告前はNULL）                 |
| version                | INTEGER     | No   |    | 1                 | 楽観ロック                           |
| started_at             | TIMESTAMPTZ | No   |    | now()             | マッチ成立日時                         |
| completed_at           | TIMESTAMPTZ | Yes  |    |                   | 試合確定日時（COMPLETED・DRAWN時に設定）     |
| created_at             | TIMESTAMPTZ | No   |    | now()             | 作成日時                            |

試合完了日時は `completed_at` とする（ADR-002）。`finished_at` は使用しない。

`reject_count` は **ADR-032 ③ により廃止した**。列は削除せず更新を停止する。過去の拒否記録を失わないためである。

### DRAWN の理由（no_contest_reason）

状態は4種類のまま増やさない（ADR-008）。`DRAWN` の内訳は本列で区別する（ADR-034 ①）。

| 値              | 到達経路                    | レート  | 確定率への計上         | クールダウン        |
| -------------- | ----------------------- | ---- | --------------- | ------------- |
| REPORT_TIMEOUT | 報告期限まで双方が申告しない          | 変えない | 不戦として両チームへ      | 両チーム          |
| NO_SHOW        | 不成立の申請に相手が無応答           | 変えない | 不戦として**無応答側のみ** | 無応答側のみ        |
| CONFLICT       | 反対申告が解けないまま承認期限切れ       | 変えない | 不戦として両チームへ      | 両チーム          |
| MUTUAL         | 不成立の申請を相手が承諾            | 変えない | **計上しない**       | 無し（1日の上限超は課す） |
| ADMIN_VOID     | 管理者による無効化               | 変えない | **計上しない**       | 無し            |

**理由によって帰結が変わるため、状態ではなく列で持つ。** `DRAWN` を一律に扱ってはならない。

### 反対申告（counter_claim）

`WINNER_REPORTED` の試合に対し、相手チームが自チームの勝利を申告した状態を表す（ADR-032 ⑩）。

* 競合中は**自動承認を行わない**。`auto-resolve-matches` は `counter_claim_team_id IS NULL` を条件に加える。
* 競合はいずれかの**投了**で解ける。承認は投了と同義であるため、専用の操作を設けない。
* 解けないまま承認期限を過ぎた場合は `DRAWN`（`CONFLICT`）とする。
* `CONFLICT` へ至る際、`winner_team_id` は NULL にするが **`reported_by_profile_id` / `reported_at` /
  `counter_claim_team_id` / `counter_claimed_at` は残す**。誰がどちらを主張したかは通報の判断材料になる
  （ADR-033 ④）。`counter_claim_team_id` が判れば、元の申告者はもう一方のチームであると一意に定まる。

### 不成立の申請（no_contest_request）

保留中の申請を `matches` の列で保持する。同時に保留できる申請は1件であり、履歴は `audit_logs` に残るため、
専用テーブルを設けない。

* `no_contest_reason_code` は `CONNECTION` / `GAME_ISSUE` / `NO_RESPONSE` / `OTHER`（ADR-034 ②）。
* **理由は結末を左右しない。** 結末を決めるのは相手の応答である。理由は `match_avoidance` の登録（10.12）と
  運営の観測にのみ用いる。
* 申請が解決した時点（承諾・応答・失効）で3列をNULLへ戻し、`no_contest_request_count` のみ加算する。

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

### 同時参加の制約（ADR-035）

規則は「1チーム同時1試合」ではない。**「進行中の試合を持つチームは、マッチング待機列に登録できない」**である。

**保証はアプリケーション層のみで行う。DBに制約を置かない。**

判定箇所は2つであり、いずれも同じ条件を用いる。

```sql
SELECT 1 FROM matches
 WHERE (team_a_id = :team_id OR team_b_id = :team_id)
   AND status NOT IN ('COMPLETED', 'DRAWN')
```

| 判定箇所                          | 目的                        |
| ----------------------------- | ------------------------- |
| `queue-match`                 | 待機列への登録を拒否する（`QUEUE-002`） |
| `runMatchmaking` の除外条件        | 待機列に残った行を組み合わせ対象から外す      |

**旧 `ux_matches_active_team_a` / `ux_matches_active_team_b` は削除する。** 2本の部分UNIQUEインデックスは
列ごとに独立しており、「あるチームが片方の試合で `team_a`、別の試合で `team_b`」という状態を防げなかった。
すなわち意図した不変条件を保証しておらず、実際に保証していた内容（同じスロットに2回現れない）は誰も要求していない。

将来「管理者がマッチを用意する」運用では1チームへ複数の試合を割り当てる（ADR-035 ⑤）。旧インデックスは
これを**そのチームがどちらのスロットへ入ったかという偶然によって**拒否するため、残すと不可解な失敗の原因になる。

参照性能は `IX_matches_team_a` / `IX_matches_team_b` が引き続き担うため、削除による影響は無い。

**★試合を生成する経路を追加する場合は、上記2つの判定を必ず自前で行うこと。DBは肩代わりしない。**
現時点で待機列を経由しない生成経路は `runMatchmaking` のみであり、同関数は
`pg_advisory_xact_lock(hashtext('matchmaking'))` と除外条件により二重割り当てを防いでいる。

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
* `COMPLETED` および `DRAWN` の後は更新しない。**管理者による訂正も行わない**（ADR-033 ①）。
  誤った結果は確定前に解く。勝者申告の押し間違えは反対申告で、対戦の不成立は不成立の申請で解決する。
* レート更新は確定時のみ実施する。経路は投了・承認・自動承認の3つである。
* `DRAWN` ではレートを更新せず `rating_history` も作らない（ADR-014）。したがって不戦の集計は
  `rating_history` ではなく本テーブルから行う（ADR-032 ⑥）。

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
| site_title              | TEXT        | No   |    | EloRating-MatchSystem | トップページのサイト名 |
| background_image_path   | TEXT        | Yes  |    | NULL    | トップページ背景。`public/` 配下の相対パス |
| rules_markdown          | TEXT        | No   |    | ''      | ルールページ本文（Markdown） |
| announcement_text       | TEXT        | No   |    | ''      | ヘッダーのお知らせ。空なら帯を出さない |
| announcement_level      | TEXT        | No   |    | INFO    | 帯の種類（INFO / WARN / ALERT） |
| team_max_members        | INTEGER     | No   |    | 3       | チーム人数上限            |
| initial_rating          | INTEGER     | No   |    | 1500    | 初期レート              |
| rating_k                | INTEGER     | No   |    | 32      | K値                 |
| match_rating_range      | INTEGER     | No   |    | 400     | マッチング許容レート差        |
| invite_expiration_hours | INTEGER     | No   |    | 24      | 招待の有効期間（時間）        |
| report_timeout_minutes  | INTEGER     | No   |    | 60      | 勝利申告の期限（分）         |
| approve_timeout_minutes | INTEGER     | No   |    | **60**  | 承認の期限（分）※ADR-032 ⑨ で 10→60 |
| max_reject_count        | INTEGER     | No   |    | 2       | **廃止**。参照しない（ADR-032 ③） |
| queue_cooldown_minutes  | INTEGER     | No   |    | 30      | クールダウンの長さ（分）       |
| report_extension_minutes | INTEGER    | No   |    | 60      | 1回の延長で伸びる長さ（分）     |
| max_report_extensions   | INTEGER     | No   |    | 3       | 報告期限の延長回数の上限       |
| no_show_minutes         | INTEGER     | No   |    | 30      | 無応答による解散が成立しうるまでの経過時間（分） |
| no_show_response_minutes | INTEGER    | No   |    | 30      | 不成立の申請への応答猶予（分）    |
| max_no_contest_requests | INTEGER     | No   |    | 2       | 1試合あたりの不成立申請の上限回数   |
| mutual_no_contest_daily_limit | INTEGER | No |  | 3       | 合意不成立を無償で行える1日あたりの件数 |
| avoidance_days          | INTEGER     | No   |    | 30      | ペアの再マッチ抑止の期間（日）    |
| max_avoidance_entries   | INTEGER     | No   |    | 5       | チームあたりの抑止登録数の上限    |
| maintenance_paused      | BOOLEAN     | No   |    | FALSE   | 保守による一時停止（シーズンとは独立） |
| updated_at              | TIMESTAMPTZ | No   |    | now()   | 更新日時               |

### Constraints

```text
PK_system_settings (id)
CHECK: id = 1
CHECK: team_max_members >= 1
CHECK: initial_rating >= 100
CHECK: rating_k BETWEEN 1 AND 128
CHECK: match_rating_range > 0
CHECK: invite_expiration_hours > 0
CHECK: report_timeout_minutes > 0
CHECK: approve_timeout_minutes > 0
CHECK: max_reject_count >= 0
CHECK: queue_cooldown_minutes > 0
CHECK: report_extension_minutes > 0
CHECK: max_report_extensions >= 0
CHECK: no_show_minutes > 0
CHECK: no_show_response_minutes > 0
CHECK: max_no_contest_requests >= 0
CHECK: mutual_no_contest_daily_limit >= 0
CHECK: avoidance_days > 0
CHECK: max_avoidance_entries >= 0
CHECK: length(btrim(site_title)) BETWEEN 1 AND 60
CHECK: background_image_path IS NULL OR (相対パスのみ / 絶対URL・`//`・`..` を禁止 / 200文字以内)
CHECK: length(rules_markdown) <= 20000
CHECK: announcement_level IN ('INFO', 'WARN', 'ALERT')
CHECK: length(announcement_text) <= 200
```

表示設定5列は View `public_settings` を通して未認証にも公開する（Issue #8・#7）。
お知らせはメンテナンス告知など、未ログインの利用者にも届ける必要がある。
**基表そのものを匿名へ公開してはならない。** K値・各種期限まで読めてしまう。

`rating_k` の上限を128とすることで、K値の境界値テストが定義可能になる。

### 廃止した設定（ADR-032 ③）

`max_reject_count` は参照しない。列は削除せず残す。適用済みMigrationを編集しないためであり、
また将来この値を読むコードが復活しないよう、本書と `04_BackendInterface.md` で明示的に廃止と記す。

### maintenance_paused と matchmaking_paused の別（ADR-034 ⑤）

| 列                    | 立てる契機          | 解除する契機                              | `queue-match` の応答 |
| -------------------- | -------------- | ----------------------------------- | ---------------- |
| `matchmaking_paused` | シーズン終了の開始      | `admin-resume-season` / 終了の取りやめ     | `SEASON-002`     |
| `maintenance_paused` | ゲーム側の障害・メンテナンス | `admin-update-system-settings` からの解除 | `QUEUE-007`      |

**両者を兼用してはならない。** `admin-resume-season` は `matchmaking_paused` を無条件に `FALSE` へ戻すため、
保守停止を同じ列で表すと、シーズン再開が保守停止を解除してしまう。

### 期限に関する設定の関係（ADR-032 ⑦⑧⑨）

```text
マッチ成立
  ├── report_timeout_minutes（60）……… 報告期限。extend-match-deadline で
  │                                     report_extension_minutes ずつ、
  │                                     max_report_extensions 回まで延長できる
  ├── no_show_minutes（30）…………… これを過ぎるまで「無応答による解散」は成立しない
  └── 勝利申告
        └── approve_timeout_minutes（60）… 承認期限。過ぎると自動承認

不成立の申請
  └── no_show_response_minutes（30）…… 応答猶予。承諾は即時に成立し、本猶予を待たない
```

**`report_timeout_minutes` の固定値を延ばしてはならない**（ADR-032 ⑦）。期限の起点はマッチ成立時刻であり、
値を延ばすと妨害の効果時間がそのまま延びる。長い対戦は当事者の宣言（延長）で扱う。

### Trigger

`update_updated_at()` を BEFORE UPDATE で適用する。

### RLS

| 操作     | 許可               |
| ------ | ---------------- |
| SELECT | 認証済みユーザー         |
| INSERT | 禁止               |
| UPDATE | Edge Functions のみ |
| DELETE | 禁止               |

管理者判定はEdge Function内で、検証済みJWTの `app_metadata.role` により行う（9.1）。

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
| SEASON_END_STARTED      | シーズン終了の開始     |
| SEASON_END_CANCELLED    | シーズン終了の取りやめ   |
| SEASON_FINALIZED        | シーズンの確定       |
| SEASON_DATA_PURGED      | 戦績・ログの削除      |
| SEASON_RESUMED          | 通常営業への復帰      |
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

* 本テーブルは追記専用とする。更新は行ってはならない。
* 削除は `admin-purge-season-data` のみが行う（Issue #9 / ADR-030）。他のいかなる経路でも削除してはならない。
  クライアントからの UPDATE / DELETE は RLS と GRANT の双方で禁止する。削除そのものを新たな1件として記録する。
* 個人情報・アクセストークンを `payload` へ記録してはならない。
* 監査ログの記録失敗は業務処理を失敗させない（記録はトランザクション外で行うか、失敗をログ出力に留める）。

---

## 10.10 abuse_reports

### 概要

不正行為・迷惑行為の通報を記録する（ADR-033）。

**本テーブルは勝敗フローから独立している。** 通報は試合の状態にもレートにも影響しない。
対象は**チーム**であり、試合ではない。関連する試合は任意で添える。

確定した試合の結果は通報によって覆らない（ADR-033 ①）。措置はクールダウンとBANに限る。

**★テーブル名は `abuse_reports` とし、`reports` としない。** 勝敗の申告が `report-match` であり、
同じ語が別の概念を指すと読み違えるためである。ADR-033 の本文は `reports` と記しているが、
これは識別子の選択であって決定内容の変更ではない。

### Columns

| Column                 | Type        | NULL | PK | Default           | Description                       |
| ---------------------- | ----------- | ---- | -- | ----------------- | --------------------------------- |
| id                     | UUID        | No   | ✓  | gen_random_uuid() | 通報ID                              |
| target_team_id         | UUID        | No   |    |                   | 通報対象チーム                           |
| reporter_profile_id    | UUID        | No   |    |                   | 通報者                               |
| reporter_team_id       | UUID        | Yes  |    |                   | 通報者の所属チーム（無所属時はNULL）              |
| match_id               | UUID        | Yes  |    |                   | 関連する試合（任意）                        |
| reason_code            | TEXT        | No   |    |                   | 理由区分                              |
| detail                 | TEXT        | No   |    |                   | 自由記述（10〜1000文字）                   |
| evidence_urls          | TEXT[]      | No   |    | '{}'              | 証拠URL（0〜3件・任意）                    |
| status                 | TEXT        | No   |    | 'OPEN'            | 通報状態                              |
| resolved_by_profile_id | UUID        | Yes  |    |                   | 措置した管理者（取り下げ・未処理の間はNULL）          |
| resolved_at            | TIMESTAMPTZ | Yes  |    |                   | 処理日時（未処理の間はNULL）                  |
| resolution_note        | TEXT        | Yes  |    |                   | 管理者の記録                            |
| created_at             | TIMESTAMPTZ | No   |    | now()             | 通報日時                              |

### 理由区分（reason_code）

| 値              | 意味                       |
| -------------- | ------------------------ |
| FALSE_REPORT   | 虚偽の勝敗申告（反対申告を含む）         |
| NO_SHOW        | 試合に現れない・申請へ応答しない         |
| HARASSMENT     | 暴言・迷惑行為                  |
| CHEATING       | ゲーム内での不正行為               |
| OTHER          | その他                      |

区分は**管理者が通報を仕分けるための手掛かり**であり、措置の内容を決定しない。措置は ADR-033 ④ の累積に基づく。

### 状態（status）

| 値         | 意味                    | 設定者   |
| --------- | --------------------- | ----- |
| OPEN      | 未処理                   | —     |
| NO_ACTION | 確認したが措置しない            | 管理者   |
| WARNED    | 警告した                  | 管理者   |
| COOLDOWN  | クールダウンを課した            | 管理者   |
| BANNED    | BANした                 | 管理者   |
| WITHDRAWN | 通報者が取り下げた             | 通報者   |

`OPEN` 以外はすべて終端である。再オープンしない。

### Constraints

```text
PK_abuse_reports (id)
FK: target_team_id         → teams.id      ON DELETE RESTRICT
FK: reporter_profile_id    → profiles.id   ON DELETE RESTRICT
FK: reporter_team_id       → teams.id      ON DELETE SET NULL
FK: match_id               → matches.id    ON DELETE SET NULL
FK: resolved_by_profile_id → profiles.id   ON DELETE RESTRICT
CHECK: reason_code IN ('FALSE_REPORT','NO_SHOW','HARASSMENT','CHEATING','OTHER')
CHECK: status IN ('OPEN','NO_ACTION','WARNED','COOLDOWN','BANNED','WITHDRAWN')
CHECK: char_length(detail) BETWEEN 10 AND 1000
CHECK: coalesce(array_length(evidence_urls, 1), 0) <= 3
CHECK: reporter_team_id IS DISTINCT FROM target_team_id
CHECK: (status = 'OPEN') = (resolved_at IS NULL)
CHECK: status NOT IN ('NO_ACTION','WARNED','COOLDOWN','BANNED')
       OR resolved_by_profile_id IS NOT NULL
```

`match_id` を `ON DELETE SET NULL` とするのは、シーズンの削除で試合が消えても通報を残すためである
（ADR-033 備考）。措置の根拠はシーズンを跨いで参照する。

`reporter_team_id` を `ON DELETE SET NULL` とするのも同じ理由による。通報者のチームが解散しても記録は残す。

`reporter_team_id IS DISTINCT FROM target_team_id` は、無所属の通報者（`reporter_team_id IS NULL`）を
妨げない。`<>` では NULL 比較が NULL となり意図が読み取りにくいため、明示的に `IS DISTINCT FROM` を用いる。

同一の試合について、同一チームから同一対象への通報を1件に限定するため、以下の部分UNIQUEインデックスを設ける。

```sql
CREATE UNIQUE INDEX ux_abuse_reports_dup
  ON abuse_reports (reporter_team_id, target_team_id, match_id)
  WHERE match_id IS NOT NULL AND status <> 'WITHDRAWN';
```

取り下げた通報は対象外である。誤って出した通報を取り下げたあと、正しく出し直せるようにするためである。

試合を伴わない通報は本インデックスで縛れない（`match_id` が NULL のため）。頻度の制限はアプリケーション層で行う
（`04_BackendInterface.md` 20.1 / `ABUSE-004`）。

### Indexes

```text
ux_abuse_reports_dup
IX_abuse_reports_target (target_team_id, created_at DESC)
IX_abuse_reports_open (created_at) WHERE status = 'OPEN'
IX_abuse_reports_reporter (reporter_profile_id, created_at DESC)
```

`IX_abuse_reports_open` は管理画面の未処理一覧のためのものである。

### RLS

| 操作     | 許可                              |
| ------ | ------------------------------- |
| SELECT | 管理者、または通報者本人（自分が出した通報のみ）        |
| INSERT | なし（Edge Function 経由）            |
| UPDATE | なし（Edge Function 経由）            |
| DELETE | なし                              |

**通報の件数と内容は公開しない**（ADR-032 ⑥）。通報は誰でも無償で出せるため、件数を公開すると
通報を浴びせるだけで他チームの評判を落とせる。`team_ranking_view` および `team_detail_view` へ
本テーブルを結合してはならない。

通報対象のチームは、自分が通報されたことを参照できない。措置（クールダウン・BAN）は結果として現れる。

### 運用ルール

* 通報は**いつでも**出せる。試合中・確定後・試合と無関係な事象のいずれでもよい。受付期間を設けない。
* 通報は**双方のチーム**が出せる。当該試合の参加チームに限定しない。
* **単発の通報で措置しない**（ADR-033 ④）。判断は「異なるチームからの累積」に基づく。
  管理画面は対象チームごとに 通報件数 `n` / 通報元チーム数 `m` / 措置件数 `k` を表示する。
* 累積の分母を**チーム**とするため、同一人物が複数アカウントを作っても、同じチームに属する限り `m` は1しか増えない。
  無所属の通報者（`reporter_team_id IS NULL`）は `n` にのみ計上し、`m` には計上しない。
* **虚偽の通報も措置の対象である**（ADR-033 ⑤）。通報者側にも記録が残る。
* 本テーブルはシーズンの削除（`admin-purge-season-data`）の対象に**含めない**。

---

## 10.11 match_avoidance

### 概要

特定のペアを一定期間マッチング対象から除外する（ADR-034 ③）。

回線相性のように**再現的に対戦が成立しないペア**を、繰り返しマッチさせないためのものである。
抑止が無ければ、同じペアが再びマッチして不成立を繰り返す。

### Columns

| Column       | Type        | NULL | PK | Default           | Description         |
| ------------ | ----------- | ---- | -- | ----------------- | ------------------- |
| id           | UUID        | No   | ✓  | gen_random_uuid() | 登録ID                |
| team_low_id  | UUID        | No   |    |                   | ペアのうちID順で小さい方       |
| team_high_id | UUID        | No   |    |                   | ペアのうちID順で大きい方       |
| match_id     | UUID        | Yes  |    |                   | 契機となった試合（任意）        |
| expires_at   | TIMESTAMPTZ | No   |    |                   | 失効日時                |
| created_at   | TIMESTAMPTZ | No   |    | now()             | 登録日時                |

**ペアは順序を持たない。** 登録時に UUID を比較して小さい方を `team_low_id` へ入れる。
`(A,B)` と `(B,A)` が別行になると、除外が片方向にしか効かない。

### Constraints

```text
PK_match_avoidance (id)
FK: team_low_id  → teams.id    ON DELETE RESTRICT
FK: team_high_id → teams.id    ON DELETE RESTRICT
FK: match_id     → matches.id  ON DELETE SET NULL
CHECK: team_low_id < team_high_id
CHECK: expires_at > created_at
UX_match_avoidance_pair (team_low_id, team_high_id)
```

`team_low_id < team_high_id` を CHECK で強制することで、正規化されていない行の混入を防ぐ。

### Indexes

```text
UX_match_avoidance_pair
IX_match_avoidance_expires (expires_at)
```

### RLS

| 操作     | 許可               |
| ------ | ---------------- |
| SELECT | 認証済みユーザー         |
| INSERT | なし（Edge Functions 経由） |
| UPDATE | なし（Edge Functions 経由） |
| DELETE | なし（Edge Functions 経由） |

登録内容はチーム詳細で公開する（ADR-034 ③）。隠すと、当たらない理由が利用者に分からなくなる。

### 運用ルール

* **登録は合意による不成立（`MUTUAL`）かつ理由が `CONNECTION` の場合のみ行う。**
  `NO_SHOW`（相手の沈黙による成立）では登録しない。**片方の操作で登録できてはならない。**
  登録できると、強い相手を恒久的に回避する手段になる。
* 有効期間は `system_settings.avoidance_days`（初期30日）とする。
* チームあたりの登録数の上限は `system_settings.max_avoidance_entries`（初期5）とする。
  上限に達した場合は最も古い行から失効させる。
* 管理者は任意の行を削除できる。
* 期限切れの行は `cleanup-matching-queue` と同じ日次バッチで削除する。残っていても
  `expires_at > NOW()` の判定により影響は無いため、削除は掃除にすぎない。
* **除外はマッチングにのみ効く。** 管理者が用意する試合は本テーブルに拘束されない（ADR-035 ⑤）。
* 本テーブルはシーズンの削除の対象に**含めない**。回線相性はシーズンを跨いで再現する。

### マッチング条件への反映

`09_MatchmakingSpecification.md` 3章の対象条件へ以下を追加する。

```sql
AND NOT EXISTS (
  SELECT 1 FROM match_avoidance a
   WHERE a.expires_at > NOW()
     AND a.team_low_id  = LEAST(:team_id, :candidate_id)
     AND a.team_high_id = GREATEST(:team_id, :candidate_id)
)
```

**★待機チーム数が少ない環境では、除外が組み合わせを枯渇させうる。** `avoidance_days` と
`max_avoidance_entries` を運営が調整できるようにしているのはこのためである（ADR-034 備考）。

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
| no_contests | 不戦数（当事者に帰責する `DRAWN`） |
| settle_rate | 確定率（0〜1、対象0件のときNULL） |
| void_count | 不成立数（`MUTUAL`。確定率とは別枠） |

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
* `DRAWN` の試合は `rating_history` を作成しないため、**勝敗数と勝率**には計上されない。
* 信頼度の3列（`no_contests` / `settle_rate` / `void_count`）は `matches` から集計する（ADR-032 ⑥）。
  集計元が `rating_history` と異なるのはこのためである。
* `settle_rate` = 確定試合数 ÷（確定試合数 ＋ `no_contests`）とする。
  分母に `MUTUAL` と `ADMIN_VOID` を含めない。対戦が成立しなかった試合を混ぜると、
  回線の相性が悪いだけのチームが不誠実に見える（7.2）。
* `NO_SHOW` は**無応答側のみ** `no_contests` に計上する。申請側は妨害の被害者であり、
  相手の無応答を自らの記録として負う理由が無い（ADR-032 ⑧）。
* **`abuse_reports` を本Viewへ結合してはならない**（ADR-032 ⑥）。通報は誰でも無償で出せるため、
  件数を公開すると通報を浴びせるだけで他チームの評判を落とせる。
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

## 11.7 abuse_report_aggregate_view

### 概要

通報の累積を対象チームごとに集計する（ADR-033 ④）。**管理画面専用である。**

### Columns

| Column              | Description                        |
| ------------------- | ---------------------------------- |
| target_team_id      | 通報対象チーム                            |
| report_count        | 通報件数 `n`                           |
| reporter_team_count | 通報元チーム数 `m`（無所属の通報者は数えない）          |
| sanction_count      | 措置件数 `k`（`COOLDOWN` / `BANNED`）    |
| last_reported_at    | 直近の通報日時                            |

### 集計の方針

* `WITHDRAWN` は除外する。取り下げた通報は判断材料にしない。
* `reporter_team_count` は `COUNT(DISTINCT reporter_team_id)` とする。**NULL は数えない。**
  無所属の通報者は `report_count` にのみ計上する。
* **`reporter_team_count` が判断の主材料である。** `report_count` は1チームから何度でも増やせるため、
  単独では信号にならない。1件の告発は雑音であり、異なるチームからの一致した告発は信号である。

累積の分母をチームとすることで、同一人物が複数アカウントを作っても、同じチームに属する限り
`m` は1しか増えない。

### RLS

`security_invoker` を有効にし、基表（`abuse_reports`）のポリシーに従わせる。
すなわち管理者のみが全件を参照できる。

**本Viewを `team_ranking_view` および `team_detail_view` へ結合してはならない。**

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
| profiles       | `UX_profiles_provider`                                                                     |
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

## 14.2 廃止した関数

以下はADR-016により廃止した。ビジネスロジックをDBへ配置しないためである。

| 関数                         | 廃止理由                                                     |
| -------------------------- | -------------------------------------------------------- |
| `calculate_rating_change()` | Eloレート計算はTypeScriptの純粋関数として実装する（単体テスト容易性のため）              |
| `increment_match_version()` | version の加算はUPDATE文で明示的に行う（Triggerとの二重加算を防ぐため）            |
| `auth_is_admin()`          | 管理者判定をJWTの `app_metadata` で行うため不要（ADR-020）。これにより2.6の例外が解消した |

---

## 11.5 public_settings

未認証にも見せる設定のみを返す（Migration 0018・0019・0021）。

| 列                     | 用途                |
| --------------------- | ----------------- |
| site_title            | トップページの見出し        |
| background_image_path | トップページの背景（相対パス）   |
| rules_markdown        | ルールページの本文         |
| announcement_text     | お知らせの本文（空なら出さない）  |
| announcement_level    | お知らせの区分（INFO/WARN/ALERT） |
| current_season        | 現在のシーズン番号         |
| matchmaking_paused    | マッチング停止中かどうか      |
| updates_locked        | 利用者の更新操作を禁止中かどうか  |

**★`system_settings` を直接公開してはならない。** 同表には未認証へ見せない運用値も含む。
公開する列を本Viewで明示的に選ぶ。

**★停止状態を公開する理由。** 伝えられないと、利用者はマッチングできないことを
不具合と区別できない。

---

## 11.6 season_list_view / season_ranking_view / season_member_view

確定済みシーズンの一覧・順位・当時のメンバーを返す（Migration 0021 / ADR-030）。
いずれも `seasons.status = 'FINALIZED'` の行のみを対象とする。

| View                | 公開範囲        | 内容                       |
| ------------------- | ----------- | ------------------------ |
| season_list_view    | 全員（未認証を含む） | シーズン番号・開始・終了日時           |
| season_ranking_view | 全員（未認証を含む） | 順位・レート・勝敗・勝率・BAN状況・終了日時   |
| season_member_view  | 認証済み        | 当時のチーム編成（表示名・役割）         |

**★`season_member_view` のみ `security_invoker` を有効にする。** 現行の
`team_detail_view` と同じ扱いであり、未認証へ全プレイヤーの表示名を晒さないためである。
残る2つは公開対象のみを含むため定義者権限のままとする。

---

# 15. Row Level Security 一覧

本節を各テーブルのRLSの正本とする。10章の記載と一致していなければならない。

| Table           | SELECT        | INSERT         | UPDATE         | DELETE         |
| --------------- | ------------- | -------------- | -------------- | -------------- |
| profiles        | 認証済み          | 本人             | 本人             | 禁止             |
| teams           | 全員（未認証を含む）    | Edge Functions | Edge Functions | 禁止             |
| team_members    | 認証済み          | Edge Functions | Edge Functions | Edge Functions |
| team_invites    | 自チームのメンバー     | Edge Functions | Edge Functions | 禁止             |
| matching_queue  | 自チームのメンバー     | Edge Functions | 禁止             | Edge Functions |
| matches         | 認証済み          | Edge Functions | Edge Functions | 禁止             |
| rating_history  | 認証済み          | Edge Functions | 禁止             | 禁止             |
| system_settings | 認証済み          | 禁止             | Edge Functions | 禁止             |
| audit_logs      | 管理者           | Edge Functions | 禁止             | Edge Functions（★） |
| seasons         | 全員（未認証を含む）    | Edge Functions | Edge Functions | 禁止             |
| season_rankings | 全員（未認証を含む）    | Edge Functions | 禁止             | 禁止             |
| season_members  | 認証済み          | Edge Functions | 禁止             | 禁止             |
| season_exports  | 禁止（Edge Functions 経由のみ） | Edge Functions | 禁止             | 禁止             |

View のRLSは基となるテーブルに従う。

| View               | SELECT     |
| ------------------ | ---------- |
| team_ranking_view  | 全員（未認証を含む） |
| team_detail_view   | 認証済み       |
| match_list_view    | 認証済み       |
| match_detail_view  | 認証済み       |
| public_settings    | 全員（未認証を含む） |
| season_list_view   | 全員（未認証を含む） |
| season_ranking_view | 全員（未認証を含む） |
| season_member_view | 認証済み       |

★`audit_logs` の DELETE は `admin-purge-season-data` のみが行う（Issue #9 / ADR-030）。
クライアントからの DELETE は RLS と GRANT の双方で禁止したままである（18.9）。

---


### 追加分（ADR-032〜035）

| テーブル            | SELECT                | INSERT / UPDATE / DELETE |
| --------------- | --------------------- | ------------------------ |
| abuse_reports   | 管理者、または通報者本人          | 不可（Edge Functions 経由）    |
| match_avoidance | 認証済みユーザー              | 不可（Edge Functions 経由）    |

`abuse_reports` の SELECT を通報者本人へも許すのは、自分が出した通報の状態を確認できるようにするためである。
**通報対象のチームは、自分が通報されたことを参照できない。**

`match_avoidance` の SELECT を認証済みへ開くのは、抑止の登録をチーム詳細で公開するためである（10.11）。
隠すと、当たらない理由が利用者に分からなくなる。

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

初期管理者は、対象利用者のログイン後に `auth.users.raw_app_meta_data` へ `{"role":"admin"}` を設定する（9.1）。

`profiles` に管理者フラグを持たないため、Seedでの投入対象は `system_settings` のみである。

---


### 追加した設定の初期値（ADR-032〜034）

| 列                               | 初期値   |
| ------------------------------- | ----- |
| queue_cooldown_minutes          | 30    |
| report_extension_minutes        | 60    |
| max_report_extensions           | 3     |
| no_show_minutes                 | 30    |
| no_show_response_minutes        | 30    |
| max_no_contest_requests         | 2     |
| mutual_no_contest_daily_limit   | 3     |
| avoidance_days                  | 30    |
| max_avoidance_entries           | 5     |
| maintenance_paused              | FALSE |

`approve_timeout_minutes` の初期値は **60** へ改めた（ADR-032 ⑨。従来は10）。

`report_timeout_minutes` は **60 のまま据え置く**（ADR-032 ⑦）。値を延ばすと妨害の効果時間がそのまま延びる。

`max_reject_count` は廃止したが、Seedからは外さない。列が NOT NULL であるためである。値は参照されない。

# 18. Migration方針

Migrationは追加方式とし、適用済みのMigrationを編集しない。

作成順序は以下とする。

```text
auth（Supabase標準）
  ↓
共通Function（update_updated_at）
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

管理者判定用の関数は定義しない。JWTのクレームを直接参照する（9.1）。

---

# 18.9 シーズン（ADR-030 / Migration 0021）

| テーブル            | 用途                                    |
| --------------- | ------------------------------------- |
| seasons         | シーズンの番号・状態・猶予期限・総解散の選択            |
| season_rankings | 確定時点の順位・レート・勝敗・BAN状況                |
| season_members  | 確定時点のチーム編成                            |
| season_exports  | 戦績・ログの持ち出し記録（削除の安全弁）                |

`seasons.status` は `ACTIVE` / `ENDING` / `FINALIZED` を取る。
`ux_seasons_open` により、`ACTIVE` と `ENDING` はそれぞれ同時に1件までである。

**★`season_rankings` と `season_members` は `teams` への外部キーを張らない。**
総解散でチームが削除されうるため、参照を持つと過去のランキングを表示できなくなる。
チーム名は退避時に複製して保持する。

**★`season_exports` を `audit_logs` と分ける。** ログの削除はシーズン機能の対象であり、
持ち出しの記録を `audit_logs` に置くと、ログを消した時点で削除の可否を判断する根拠ごと消える。

**★`audit_logs` の追記専用には例外が1つある。** `admin-purge-season-data` は
シーズンのログを削除する（Issue #9 / ADR-030）。クライアントからの UPDATE / DELETE は
RLS と GRANT の双方で禁止したままであり、削除できるのは Edge Function の直接接続のみである。
削除そのものは新たな1件として記録するため、何が消えたのかは後から確かめられる。

`system_settings` には `current_season`・`matchmaking_paused`・`updates_locked`・
`season_grace_minutes` を持たせる。前3者は `public_settings` を通して未認証にも公開する。
**★停止していることを伝えられないと、利用者は不具合と区別できない。**

---

# 18.10 勝敗報告の確定方式（ADR-032〜035 / Migration 0023）

本Migrationは4本のADRを1つのまとまりとして反映する。**分割しない。**
中間状態（例：拒否を廃止したが投了が無い）は、敗者が結果を確定させる手段を持たない不整合な仕様となるためである。

### 追加するテーブル

| テーブル            | 用途                    | 定義   |
| --------------- | --------------------- | ---- |
| abuse_reports   | 通報（ADR-033）           | 10.10 |
| match_avoidance | ペアの再マッチ抑止（ADR-034 ③）  | 10.11 |

### 追加する列

| テーブル            | 列                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| teams           | `queue_cooldown_until`                                                                                                                                |
| matches         | `no_contest_reason`、`counter_claim_team_id`、`counter_claimed_at`、`report_extension_count`、`no_contest_requested_by_team_id`、`no_contest_requested_at`、`no_contest_reason_code`、`no_contest_request_count` |
| system_settings | `queue_cooldown_minutes`、`report_extension_minutes`、`max_report_extensions`、`no_show_minutes`、`no_show_response_minutes`、`max_no_contest_requests`、`mutual_no_contest_daily_limit`、`avoidance_days`、`max_avoidance_entries`、`maintenance_paused` |

### 削除するもの

| 対象                                                     | 理由                                    |
| ------------------------------------------------------ | ------------------------------------- |
| `ux_matches_active_team_a` / `ux_matches_active_team_b` | 意図した不変条件を保証していない（ADR-035 ③ / 10.6）    |

**★適用済みMigrationを編集せず、打ち消しのMigrationで落とす。**

```sql
DROP INDEX IF EXISTS ux_matches_active_team_a;
DROP INDEX IF EXISTS ux_matches_active_team_b;
```

### 変更する既定値

| 対象                                        | 変更           | 根拠        |
| ----------------------------------------- | ------------ | --------- |
| `system_settings.approve_timeout_minutes` | 10 → 60      | ADR-032 ⑨ |

**既存行の値も更新する。** DEFAULT の変更は既存の1行に反映されないため、`UPDATE system_settings SET ...` を
同じMigrationに含める。本テーブルは常に1行である（10.8）。

### 残すが更新を止めるもの

| 対象                                 | 扱い                                |
| ---------------------------------- | --------------------------------- |
| `matches.reject_count`             | 列を残し、更新しない。過去の拒否記録を失わないため         |
| `system_settings.max_reject_count` | 列を残し、参照しない                        |

**★列を消さない判断は「消せない」からではない。** 過去の記録を保つためである。
一方 `ux_matches_active_*` を消すのは、それが記録ではなく**誤った規則**だからである。両者を混同しないこと。

### 制約の追加

`matches` の CHECK 制約を追加する。既存の `chk_matches_*` は編集せず、新しい制約として足す。

```text
CHECK: no_contest_reason IS NULL
       OR no_contest_reason IN ('REPORT_TIMEOUT','NO_SHOW','MUTUAL','CONFLICT','ADMIN_VOID')
CHECK: (status = 'DRAWN') = (no_contest_reason IS NOT NULL)
CHECK: counter_claim_team_id IS NULL OR counter_claim_team_id IN (team_a_id, team_b_id)
CHECK: (counter_claim_team_id IS NULL) = (counter_claimed_at IS NULL)
CHECK: no_contest_requested_by_team_id IS NULL
       OR no_contest_requested_by_team_id IN (team_a_id, team_b_id)
CHECK: (no_contest_requested_by_team_id IS NULL) = (no_contest_requested_at IS NULL)
CHECK: no_contest_reason_code IS NULL
       OR no_contest_reason_code IN ('CONNECTION','GAME_ISSUE','NO_RESPONSE','OTHER')
CHECK: report_extension_count >= 0
CHECK: no_contest_request_count >= 0
```

**★既存の `chk_matches_drawn` と両立させる。** 同制約は `DRAWN` で `winner_team_id IS NULL` を要求する。
`CONFLICT` へ落とす際は `winner_team_id` を NULL にし、`reported_by_profile_id` / `reported_at` /
`counter_claim_team_id` / `counter_claimed_at` は残す（10.6）。

### 適用済みデータの扱い

`no_contest_reason` を NOT NULL にできないのは、既存の `DRAWN` 行に理由が無いためである。
Migration では既存の `DRAWN` 行を `REPORT_TIMEOUT` で埋める。当時 `DRAWN` へ至る経路は
報告期限切れと拒否上限の2つであり、後者は `reject_count > 0` で判別できる。

```sql
UPDATE matches
   SET no_contest_reason = 'REPORT_TIMEOUT'
 WHERE status = 'DRAWN' AND no_contest_reason IS NULL;
```

**★拒否上限で解散した過去の行も `REPORT_TIMEOUT` へ寄せる。専用の値を与えない。** 廃止した経路であり
（ADR-032 ③）、値を増やすと新しい仕様に存在しない状態を将来のコードが扱わねばならなくなる。
両者は `reject_count > 0` で判別できるため、当時の経緯は失われない。

### View の再作成

`team_ranking_view` に信頼度の3列を足すため再作成する（11.1）。`abuse_report_aggregate_view` を新設する（11.7）。

**★`CREATE OR REPLACE VIEW` は列の追加に使えない場合がある**（既存列の型・順序が変わるとき）。
`DROP VIEW` → `CREATE VIEW` の順で行い、`security_invoker` の設定を再指定する。

---

# 19. DB更新経路

| テーブル            | 更新経路                             |
| --------------- | -------------------------------- |
| profiles        | クライアントから直接更新可（本人のみ）      |
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
