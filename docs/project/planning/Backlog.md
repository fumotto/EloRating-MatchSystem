# Backlog.md

# Project Backlog

Version: 1.0
Status: Active

---

# 1. 目的

本書は、本プロジェクトにおいて今後実施を検討するタスクを管理する。

Backlogは未着手の候補一覧であり、Implementation RoadmapおよびProject Statusとは役割を分離する。

---

# 2. 運用方針

* Backlogには着手前のタスクを登録する。
* 優先順位は定期的に見直す。
* 実装を開始するタスクはMilestoneへ移動する。
* 完了したタスクはBacklogから削除し、履歴はChangelogおよびGitで管理する。

---

# 3. タスク状態

| 状態       | 説明    |
| -------- | ----- |
| Proposed | 提案済み  |
| Ready    | 着手可能  |
| Deferred | 延期    |
| Rejected | 採用しない |

---

# 4. 優先度

| 優先度 | 説明  |
| --- | --- |
| P0  | 最優先 |
| P1  | 高   |
| P2  | 中   |
| P3  | 低   |

---

# 5. Backlog一覧

B-001 〜 B-012 は 2026-08-04 の現況調査で発見した実装欠陥である。
B-013 は S0 の実施中に発見した。
いずれも設計書の不備ではなく、既存実装と設計書の乖離である。

| ID    | タイトル                                        | カテゴリ           | 優先度 | 状態       | 依存タスク | Slice |
| ----- | ------------------------------------------- | -------------- | --- | -------- | ----- | ----- |
| B-001 | `0012_triggers.sql` のトリガ二重定義を解消する            | Bug            | P0  | **完了**   | なし    | S0    |
| B-002 | `0013_rls.sql` の DELETE ポリシーの構文誤りを修正する       | Bug            | P0  | **完了**   | なし    | S0    |
| B-003 | `team_members` の `updated_at` とトリガの不整合を解消する  | Bug            | P0  | **完了**   | なし    | S0    |
| B-004 | View の RLS 適用範囲を `security_invoker` で明示する    | Security       | P0  | **完了**   | なし    | S0    |
| B-005 | RLSポリシーの欠落・不統一を解消する                          | Security       | P1  | **完了**   | なし    | S0    |
| B-006 | Seed の配置を `00_DirectoryStructure.md` と整合させる  | Refactor       | P2  | **完了**   | なし    | S0    |
| B-013 | クライアントロールへのテーブル GRANT を付与する                  | Bug            | P0  | **完了**   | なし    | S0    |
| B-007 | テスト実行基盤の不整合を解消する（`npm test` が通らない）           | Test           | P0  | **完了**    | なし    | S0.5  |
| B-008 | `_shared/auth.ts` のJWT検証を実装する                | Bug            | P0  | **完了**    | なし    | S1    |
| B-009 | `ensure-profile` の `provider_user_id` 取得を修正する | Bug            | P0  | **完了**    | B-008 | S1    |
| B-010 | `create-team` の `audit_logs` INSERT 列を修正する   | Bug            | P0  | **完了**    | B-008 | S2    |
| B-011 | Bun を導入しフロントエンドを初期化する                        | Infrastructure | P0  | **完了**    | なし    | S3    |
| B-012 | `.env.example` を追加する                         | Documentation  | P2  | **完了**   | なし    | S4    |
| B-014 | `withTransaction` の `tx` に型を与え `deno check` を通す | Bug            | P1  | **完了**   | なし    | S1    |
| B-015 | チーム名長エラーコードの仕様と実装の乖離を解消する               | Bug            | P2  | **完了**   | なし    | S2    |

**Backlog に未着手の項目は存在しない。** 以後に発見した欠陥は B-016 以降として追加する。

---

**★未着手の項目は無い。** B-001 〜 B-015 はすべてMVPで完了した。
公開後の変更は GitHub Issue で管理しており、本書へは登録していない。
新しい実施候補が出た時点で本書へ戻す。

---

# 5.1 詳細

## B-001 `0012_triggers.sql` のトリガ二重定義を解消する

背景
`supabase/migrations/0012_triggers.sql` が `tr_profiles_update_updated_at` / `tr_teams_update_updated_at` /
`tr_team_members_update_updated_at` / `tr_system_settings_update_updated_at` を作成するが、
これらは `0002_profiles.sql` / `0003_teams.sql` / `0004_team_members.sql` / `0009_system_settings.sql` で
既に同名で作成されている。

期待する成果
`supabase db reset` が `trigger already exists` で停止しないこと。定義箇所を一方へ統一すること。

関連設計書：03_Database.md

## B-002 `0013_rls.sql` の DELETE ポリシーの構文誤りを修正する

背景
`p_team_members_delete` が `FOR DELETE ... WITH CHECK (false)` と定義されている。
PostgreSQL は DELETE ポリシーに `WITH CHECK` を許可しないため、Migration が構文エラーで停止する。

期待する成果
`USING (false)` へ修正し、Migration が完走すること。

関連設計書：03_Database.md

## B-003 `team_members` の `updated_at` とトリガの不整合を解消する

背景
`team_members` は `updated_at` 列を持たないが、`update_updated_at()` を実行する BEFORE UPDATE トリガが張られている。
UPDATE 実行時に `record "new" has no field "updated_at"` で失敗する。
`transfer-leader`（role の更新）が確実に失敗する。

期待する成果
列を追加するか、トリガを削除するかを 03_Database.md と照合して決定し、整合させること。

関連設計書：03_Database.md、04_BackendInterface.md（9.6）

## B-004 View の RLS 適用範囲を `security_invoker` で明示する

背景
PostgreSQL の View は既定で定義者の権限で実行されるため、基表のRLSを迂回する。
現状では `team_detail_view` / `match_list_view` / `match_detail_view` が未認証でも参照可能になりうる。

期待する成果
`team_detail_view` / `match_list_view` / `match_detail_view` へ `WITH (security_invoker = on)` を付与する。
`team_ranking_view` は ADR-018 により未認証公開が要件であるため、定義者権限のまま anon へ明示的に GRANT する
（`security_invoker = on` にすると anon が `rating_history` を参照できず、勝敗数が常に 0 になるため）。

関連設計書：03_Database.md、15_DecisionLog.md（ADR-018）

## B-005 RLSポリシーの欠落・不統一を解消する

背景
`matching_queue` / `matches` / `system_settings` に DELETE ポリシーが存在しない。
また `teams` の UPDATE ポリシーが `USING` を持たない。
「更新系はすべて Edge Function（DB直結）で行う」という方針（ADR-016）を、全テーブルで同一の書き方に統一する必要がある。

期待する成果
全テーブルのRLSポリシーが 03_Database.md と一致し、意図が読み取れる状態になること。

関連設計書：03_Database.md、15_DecisionLog.md（ADR-016）

## B-006 Seed の配置を `00_DirectoryStructure.md` と整合させる

背景
`00_DirectoryStructure.md` は `supabase/seed/` を Seed の配置場所と定めているが、
実際の Seed は `0014_seed.sql` として Migration に含まれている。

期待する成果
`config.toml` の Seed 設定へ寄せるか、Migration 同梱を正とするかを決定し、文書と実装を一致させること。

関連設計書：00_DirectoryStructure.md、11_Deployment.md（8章）

## B-007 テスト実行基盤の不整合を解消する

背景
`tests/` 配下の6ファイルはすべて `jsr:@std/assert` と `Deno.test` を使う Deno Test 形式だが、
`package.json` の `test` は Vitest を起動する。`--passWithNoTests` によって失敗が表面化していないだけであり、
現状 `npm test` は品質ゲートとして機能していない。Deno は未導入である。

期待する成果
Deno を導入し、`tests/unit/`（Vitest）と `tests/integration/`（Deno Test）へ再配置する。
`npm test` が双方を実行して成功すること。

対応内容（S0.5 で完了）
Deno 2.9.5 を導入し `deno.json` を新設した。分割基準は「Unit＝ビジネスロジック単体」「Integration＝APIからDBまでの通し」とし、
`https:` を import するモジュールは Vitest から解決できないため Integration とした。
テストは ADR-012 に従い `describe` / `it` 形式へ書き換え、TC-ID を付与した（`INFRA` カテゴリを新設）。
`tsconfig.json` の `include` を Node 側の範囲へ限定し、Deno 側の型検査は `deno check` が担う二本立てとした。
なお B-011 で npm から Bun へ移行したため、現在の起動コマンドは `bun run test` である（ADR-025）。

関連設計書：00_DirectoryStructure.md、10_TestSpecification.md、11_Deployment.md（11.3.1）、12_TechnologyStack.md（5章）

## B-008 `_shared/auth.ts` のJWT検証を実装する

背景
`verifyJwt` が `verify(token, "SECRET_KEY")` を呼んでいる。djwt v3 は鍵として `CryptoKey` を要求するため
常に例外が発生し、`verifyJwt` は必ず `null` を返す。結果としてすべての Edge Function が 401 を返す。
**全 Edge Function に共通する最上位の障害である。**

期待する成果
実際に Supabase の JWT を検証できること。Supabase の新規プロジェクトは非対称鍵が既定になりうるため、
`supabase-js` の `auth.getUser(token)` による検証を第一候補とする。
`04_BackendInterface.md` 4.3 のクレーム（`sub`、`app_metadata.role`、`app_metadata.provider`）を取り出せること。
テスト用の差し替え口（`setJwtVerifier`）は維持する（ADR-021）。

対応内容（S1 で完了）
djwt を廃し、`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).auth.getUser(token)` による検証へ置き換えた。
非対称鍵・鍵ローテーション・失効済みユーザーへ追随できる。クライアントは `db.ts` のプールと同じく初回利用時に生成する。
`JwtClaims` へ `user_metadata.provider_id` を追加した（B-009 の前提）。
`resetJwtVerifier` が既定実装へ戻らない不具合も併せて修正した。
supabase-js は `https://esm.sh/@supabase/supabase-js@2.47.10` で固定する（`jsr:` 版は不可・ADR-025）。

関連設計書：04_BackendInterface.md（4章）、15_DecisionLog.md（ADR-021、ADR-025）

## B-009 `ensure-profile` の `provider_user_id` 取得を修正する

背景
`provider_user_id` に Supabase の `auth.uid()` を格納しており、
ADR-015 が定める `UNIQUE (auth_provider, provider_user_id)` が本来の意味を持たない。
また `auth_provider` のフォールバックが `"steam"` になっている（ADR-022 により Discord が正）。

期待する成果
`provider_user_id` を JWT の `user_metadata.provider_id` から取得し、`auth_provider` を実際のプロバイダから設定すること。

対応内容（S1 で完了）
`provider_user_id` を `claims.user_metadata.provider_id` から、`auth_provider` を `claims.app_metadata.provider` から取得する。
`"steam"` へのフォールバックは削除した（ADR-022）。両者が欠落している場合は `profiles` の NOT NULL を満たせないため
`SYSTEM-001` を返す（TC-INFRA-014）。有効なJWTであればプロバイダ情報は必ず含まれるため、欠落は認証基盤側の構成不備である。
TC-TEAM-005 として、ボディの `authProvider` / `providerUserId` を無視しJWTを優先することを検証する。

関連設計書：04_BackendInterface.md（9.1）、15_DecisionLog.md（ADR-015、ADR-022）

## B-010 `create-team` の `audit_logs` INSERT 列を修正する

背景
`INSERT INTO audit_logs (action, team_id, profile_id)` と記述されているが、
`audit_logs` の実際の列は `actor_profile_id` / `action` / `target_type` / `target_id` / `payload` である（ADR-017）。
存在しない列への INSERT であり、`target_type` は NOT NULL であるため必ず失敗する。

期待する成果
`target_type = 'TEAM'`、`target_id = team.id`、`actor_profile_id = claims.sub` として正しく記録されること。

対応内容（S2 で完了）
`INSERT INTO audit_logs (actor_profile_id, action, target_type, target_id) VALUES ($1, 'TEAM_CREATED', 'TEAM', $2)` へ修正した。
TC-TEAM-017 として、発行されたSQLの列並びとパラメータ、COMMIT への到達を検証するテストを追加した。
従来はモックが全SQLに空行を返していたため、存在しない列への INSERT がテストで検出できなかった。

関連設計書：03_Database.md、04_BackendInterface.md（9.2）、15_DecisionLog.md（ADR-017）

## B-011 Bun を導入しフロントエンドを初期化する

背景
`src/` が存在せず、Vite も React も未導入である。`12_TechnologyStack.md` は Bun を正本としているが未導入である。

期待する成果
`05_Frontend.md` 4章および `00_DirectoryStructure.md` に準拠した `src/` を作成し、開発サーバーが起動すること。

対応内容（S3 で完了）
Bun 1.3.14 を導入し、`package-lock.json` を削除して `bun.lock` へ一本化した（ADR-025）。
Vite ＋ React 19 ＋ TanStack Router（ファイルベース・ADR-026）＋ TanStack Query ＋ Zustand ＋ RHF ＋ Zod ＋
Tailwind CSS v4 で `src/` を新設した。採用バージョンは ADR-027 に記録した。
画面は `ImplementationRoadmap.md` S3 のとおり `/login`・`/ranking`・`/dashboard` の3枚に限定した。
`utils/errorMessage.ts` にエラーコード → 表示文言の変換を集約した。
`oxlint` / `oxfmt` を導入し、CI（`.github/workflows/ci.yml`）を新設した。

`oxfmt` の対象から `docs/` を除外している。設計書は正本であり、整形ツールで一括変更してはならない。

**未達**：S3 の完了条件のうち「Discord ログイン → `ensure-profile` → `/dashboard` 遷移」と
「画面からのチーム作成 → ランキング反映」は Discord クレデンシャル未取得のため未検証である。
`/ranking` の未認証表示のみ確認済み。

関連設計書：05_Frontend.md、00_DirectoryStructure.md、11_Deployment.md（11.3.1）、12_TechnologyStack.md、15_DecisionLog.md（ADR-025〜027）

## B-013 クライアントロールへのテーブル GRANT を付与する

背景
S0 の実施中に発見した。RLSポリシーを整備しても、未認証（`anon`）は `teams` を参照できず 401 となった。

Supabase の既定では、新規テーブルに対して `anon` / `authenticated` へ付与されるのは
TRUNCATE / REFERENCES / TRIGGER / MAINTAIN のみであり、**SELECT は付与されない**。
テーブル権限とRLSは独立した2つの関門であり、両方を通す必要がある。
`0013_rls.sql` はRLSのみを定義していたため、ポリシーが許可していてもすべてのテーブルが参照不能であった。

放置した場合、ランキングの未認証公開（ADR-018）が成立せず、認証済み画面も一切データを取得できない。

また、既定で付与される TRUNCATE にはRLSが適用されないため、削除禁止の方針（03_Database.md 2.4）を迂回できる。

期待する成果
`03_Database.md` 15章の公開範囲どおりに GRANT を付与し、TRUNCATE を取り消すこと。

関連設計書：03_Database.md（15章）、15_DecisionLog.md（ADR-018）

## B-012 `.env.example` を追加する

背景
`.gitignore` は `!.env.example` を明示的に許可しているが、当該ファイルが存在しない。
必要な環境変数が `11_Deployment.md` 4章にしか存在せず、環境構築時に参照漏れが起こりやすい。

期待する成果
フロントエンド（`VITE_` 接頭辞）とバックエンドの必要変数を列挙したテンプレートが存在すること。
**値は記載しない。**

関連設計書：11_Deployment.md（4章・14章）

## B-014 `withTransaction` の `tx` に型を与え `deno check` を通す

背景
`_shared/db.ts` の `withTransaction` がコールバックへ渡す `tx` に型が付いておらず、
呼び出し側の `tx.queryObject<T>()` が `TS2347: Untyped function calls may not accept type arguments` になる。
`create-team` で3件、`ensure-profile` で3件、計6件が発生する。

期待する成果
`tx` を deno-postgres の `PoolClient` として型付けし、`deno check` が成功すること。

対応内容（S1 で完了）
`withTransaction` の `fn` を `(tx: PoolClient) => Promise<T>` へ型付けし、`PoolClient` を再エクスポートした。
`deno test` から `--no-check` を外し、`typecheck` を `tsc --noEmit` ＋ `deno check` の二本立てとした。

型付けにより、`any` に隠れていた不具合が4件表面化したので併せて修正した。

* `create-team`：`teams` の SELECT 結果を応答DTOの `CreateTeamResponse`（`teamId` を持つ）で型付けしていたため、
  実際の列 `id` が型に存在しなかった。DB行用に `TeamRow` を新設した。
* `ensure-profile`：`avatar_url` は DB では NULL 許容だが DTO は `string | undefined` である。`?? undefined` で変換した（3箇所）。

関連設計書：04_BackendInterface.md（2.1）、11_Deployment.md（11.3.1）、15_DecisionLog.md（ADR-016）

## B-015 チーム名長エラーコードの仕様と実装の乖離を解消する

背景
`10_TestSpecification_Part3_Team.md` の TC-TEAM-012 / TC-TEAM-013 はチーム名の長さ違反に対し
`VALIDATION-001` を期待するが、`create-team` の実装は `VALIDATION-003` を返す。

期待する成果
`06_ErrorCode.md` を正として、実装かテスト仕様のいずれを修正するかを決定し、両者を一致させること。

対応内容（S2 で完了）
`06_ErrorCode.md` 2章では `VALIDATION-001` が「入力値が不正です」、`VALIDATION-003` が「入力値が範囲外です」である。
チーム名の長さ違反は範囲の違反であるから `VALIDATION-003` が正しく、**実装が正・テスト仕様が誤り**であった。
`04_BackendInterface.md` 9.2 が両方のコードを挙げているのは、型の誤りと範囲の違反が別物だからである。
`10_TestSpecification_Part3_Team.md` の TC-TEAM-012 / TC-TEAM-013 を `VALIDATION-003` へ修正し、注記を追加した。
実装は変更していない。

関連設計書：06_ErrorCode.md、04_BackendInterface.md（9.2）、10_TestSpecification_Part3_Team.md（3.2）

---

# 6. カテゴリ

タスクは以下のカテゴリで管理する。

* Feature
* Enhancement
* Refactor
* Bug
* Test
* Documentation
* Infrastructure
* Security
* Performance

---

# 7. 登録ルール

新しいBacklogを登録する際は、以下を記載する。

* タイトル
* 背景
* 期待する成果
* 優先度
* 依存タスク
* 関連設計書

---

# 8. Backlogレビュー

定期的に以下を確認する。

* 優先順位
* 重複タスク
* 不要タスク
* 依存関係

不要になったタスクはRejectedへ変更する。

---

# 9. Milestoneへの移行

以下を満たしたタスクはMilestoneへ移行できる。

* 要件が明確である。
* 設計書が存在する。
* 依存タスクが解消されている。
* 実装可能と判断された。

---

# 10. AI運用

AIはBacklogを直接実装対象としない。

AIが実装を行う対象は、MilestoneまたはImplementation Roadmapへ登録されたタスクとする。

Backlogに対しては、設計支援・調査・見積り・実現性の提案のみを行う。
