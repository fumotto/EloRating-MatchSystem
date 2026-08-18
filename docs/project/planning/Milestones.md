# Milestones.md

# Project Milestones

Version: 1.0
Status: Active

---

# 1. 目的

本書は、本プロジェクトの開発目標（マイルストーン）を管理する。

各マイルストーンは、達成すべき成果物、対象タスク、および完了条件を定義する。

---

# 2. 運用方針

* Backlogから実施対象を選定し、Milestoneを作成する。
* Milestoneごとに達成目標を定義する。
* 完了したMilestoneは履歴として保持する。
* 実装順序はImplementation Roadmapで管理する。

---

# 3. ステータス

| 状態        | 説明  |
| --------- | --- |
| Planned   | 計画中 |
| Active    | 実施中 |
| Completed | 完了  |
| Cancelled | 中止  |

---

# 4. マイルストーン一覧

| ID | 名称      | 状態      | 目標日 | 達成率 |
| -- | ------- | ------- | --- | --- |
| M1 | 開発基盤構築  | Completed | 2026-08-08 | 100% |
| M2 | チーム管理機能 | Completed | 2026-08-08 | 100% |
| M3 | マッチング機能 | Completed | 2026-08-08 | 100% |
| M4 | ランキング機能 | Completed | 2026-08-08 | 100% |
| M5 | MVPリリース | Completed | 2026-08-10 | 100% |

---

# 4.1 実装スライスとの対応

実装の進行単位は `ImplementationRoadmap.md` のスライス S0 〜 S6 である（ADR-023）。
マイルストーンは達成目標を示すものであり、スライスと1対1で対応しない。

| Milestone | 対応スライス                 | 補足                                              |
| --------- | ---------------------- | ----------------------------------------------- |
| M1        | S0、S0.5、S3（初期化）、S4（CI） | 基盤はスライスに分散する。S0 の完了が M1 の実質的な起点である              |
| M2        | S2、S5（Team / Invite）   | チーム作成のみ S2 で先行し、招待・脱退・移譲は S5 で完了する               |
| M3        | S5（Queue / Match / 自動解決） |                                                 |
| M4        | S3（ランキング表示）、S5（Rating） | 表示は S3 で先行し、レート計算は S5 で完了する                     |
| M5        | S4、S6                  | S4 で公開経路を確立し、S6 で全テストを満たしてMVPとする                |

---

# 5. マイルストーン詳細

## M1 開発基盤構築

### 目的

開発を継続できる基盤を整備する。

### 対象

* Supabase Local（`supabase init` / `config.toml` / Migration の完走）
* Bun環境
* React / Vite / TanStack Router
* GitHub Actions
* Vitest / Deno Test / pgTAP / Playwright

認証プロバイダのPoCは実施しない。ADR-022 により Discord で確定したためである。

### 関連設計書

* 12_TechnologyStack.md
* 11_Deployment.md
* 15_DecisionLog.md（ADR-022、ADR-023、ADR-024）

### 完了条件

* `supabase db reset` がエラーなく完走する。 → ✅ S0
* 開発環境が構築されている。 → ✅ S3 / B-011（Bun ＋ Vite ＋ React ＋ TanStack Router）
* CIが正常に動作する。 → ✅ S4（`.github/workflows/ci.yml`）
* テスト基盤が利用可能である（`bun run test` が成功する）。 → ✅ S0.5

M1 は達成済みである。テスト起動コマンドは B-011 の Bun 移行に伴い `npm test` から `bun run test` へ変わった（ADR-025）。

CI は S5 / S6 でテストを追加したことにより、Database Test（pgTAP）と E2E Test（Playwright）を含む
全ステップを有効化してある（`11_Deployment.md` 11.3.2）。

---

## M2 チーム管理機能

### 目的

チーム管理機能を提供する。

### 対象

* Team
* Team Members
* Team Invite

### 関連設計書

* 03_Database.md
* 04_BackendInterface.md
* 05_Frontend.md

### 完了条件

* チーム作成・招待発行・招待参加・脱退・リーダー移譲が利用可能である。
* 関連テストが成功する。

チーム名変更・チーム削除はMVP対象外である（`13_FutureFeatures.md`）。

---

## M3 マッチング機能

### 目的

対戦待機から試合成立までを実装する。

### 対象

* Matching Queue
* Match（申告・承認・拒否）
* 自動解決（タイムアウト）

### 関連設計書

* 04_BackendInterface.md
* 07_APISequence.md
* 09_MatchmakingSpecification.md

### 完了条件

* マッチングが成立し、試合が `PLAYING` で作成される。
* 勝利申告・承認・拒否が利用可能である。
* 期限切れの試合が自動的に解決される。

---

## M4 ランキング機能

### 目的

レート計算およびランキングを提供する。

### 対象

* Rating
* Ranking
* Rating History

### 関連設計書

* 08_RatingSpecification.md
* 03_Database.md

### 完了条件

* レート更新が正しく行われる。
* ランキングが表示される。

---

## M5 MVPリリース

### 目的

MVPを一般公開する。

### 対象

* 本番環境
* デプロイ
* リリースノート

### 関連設計書

* 11_Deployment.md

### 完了条件

* 本番環境で利用可能である。
* Changelogが更新されている。

### 実施結果（2026-08-10 完了）

`deploy.yml` の手動実行で公開した。Supabase クラウドプロジェクトの作成と資格情報の登録は
`SetupRunbook.md` 作業5〜7として実施済みである。

**★公開直後は通しで動かなかった。** PKCEフロー、CORSプリフライト、Connection Pooler 経由の接続、
ログアウト後の遷移、セッション確定前のルータ再生成に不具合があり、実利用できる状態になったのは
2026-08-16 である。いずれも**クラウド固有の条件**（本番URL・別オリジン・接続数）で表面化したもので、
Supabase Local では再現しなかった。**公開経路を整えることと、公開先で動くことは別である。**

---

# 5.1 M5 以降

**M6 以降は設定していない。** MVPの計画分はすべて完了しており、Backlog にも未着手の項目は無い。

公開後の変更は Issue 単位で進めている（`ProjectStatus.md` 2.1）。次のテーマを決めた時点で
本書へマイルストーンとして登録する。候補は `13_FutureFeatures.md` にある。

---

# 6. Backlogとの関係

* Backlogは実施候補を管理する。
* Milestoneは実施対象を管理する。
* Backlogから選定されたタスクのみをMilestoneへ登録する。

---

# 7. Roadmapとの関係

Implementation Roadmapは、Milestone内のタスク実行順序を管理する。

---

# 8. 更新ルール

マイルストーンは以下の場合に更新する。

* 新しい目標を設定した場合
* 完了条件を変更した場合
* 状態が変更した場合

---

# 9. AI運用

AIはMilestoneを現在の開発目標として扱う。

Milestoneに含まれない機能を実装する場合は、提案として提示し、独断で実装を開始してはならない。
