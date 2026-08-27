# EloRating MatchSystem

チーム対戦のレーティングシステム。仲間とチームを組み、実力の近い相手と自動でマッチングし、
勝敗に応じて Elo レーティングが上下します。

**[デモサイト](https://fumotto.github.io/EloRating-MatchSystem/)** — ランキングはログイン不要で閲覧できます。

---

## できること

- Discord でログイン（パスワード管理が不要）
- チームの作成、招待コードによるメンバー招集、リーダーの移譲
- レートの近いチーム同士の自動マッチング
- 投了（負けたチームの自己申告）による結果確定と Elo レーティングの更新
- 勝利申告と承認、主張が食い違う場合の反対申告
- 回線相性・障害による対戦不成立の申請（合意で成立し、双方に不利益なし）
- 期限切れの試合を自動で決着させる定期処理
- 不正・迷惑行為の通報と、累積に基づく措置（勝敗フローからは独立）
- チームメンバーの一覧表示（ランキングや試合の画面から他チームも確認できる）
- ルールページと運営からのお知らせ（管理画面から編集する）
- シーズンの区切り（レート初期化、シーズン別ランキングの保存、戦績の持ち出しと削除）
- 管理者によるチームのBAN、システム設定の変更、監査ログの参照

対戦そのものはこのシステムの外で行います。本システムが担うのは
**相手の割り当て**と**結果の記録・レート計算**です。

## ドキュメント

| 読者 | 文書 |
| --- | --- |
| 選手として使う人 | [使い方ガイド](docs/PlayerGuide.md) |
| 自分で立ち上げて運営する人 | [導入・運営ガイド](docs/ForkGuide.md) |
| 開発する人 | [設計書](docs/design/) / [ReferenceIndex](docs/ReferenceIndex.md) |
| 環境を構築する人 | [SetupRunbook](docs/project/SetupRunbook.md) |

前2つはデプロイ後のサイトからも読めます（設定画面の下部にリンクがあります）。

## 自分用に立ち上げる

fork して、GitHub・Supabase・Discord をつなげば動きます。
プログラミングの知識は要りません。所要 60〜90分、費用は無料枠に収まります。

手順は **[導入・運営ガイド](docs/ForkGuide.md)** にあります。

---

## 技術構成

| 領域 | 採用 |
| --- | --- |
| フロントエンド | React 19 / TypeScript / Vite / TanStack Router / TanStack Query / Tailwind CSS v4 |
| バックエンド | Supabase（PostgreSQL / Auth / Realtime / Edge Functions） |
| Edge Functions | Deno |
| 配信 | GitHub Pages |
| パッケージ管理 | Bun |
| Lint / Format | oxlint / oxfmt |

詳細は [12_TechnologyStack.md](docs/design/12_TechnologyStack.md)、採用の経緯は
[15_DecisionLog.md](docs/design/15_DecisionLog.md) にあります。

### 設計上の要点

**更新系はすべて Edge Functions を経由します。** Supabase SDK（PostgREST）は複数ステートメントに
またがるトランザクションを開始できないため、Edge Functions から PostgreSQL へ直接接続し、
`BEGIN` / `COMMIT` を明示的に発行しています（ADR-016）。

**直接接続は RLS を迂回します。** そのため各 Edge Function は冒頭で必ず認可チェックを行います。
RLS は参照系（PostgREST 経由）の防御層であり、両者は別物です。

**レート計算は TypeScript の純粋関数です。** PL/pgSQL へ集約せず、単体テスト可能な形にしています。

**「敗北を誤魔化そうとする」を前提に設計しています。** 参加者が単独で「レート変動なし」の
終端へ到達できる経路を置かず、誤魔化す経路の代償はレートではなく**時間**（マッチング待機の
クールダウン）で払わせます。レートは強さの指標として保ちます。**投了と承認が最短で次の試合へ
進める道**です（ADR-032）。

**確定した結果は訂正しません。** システムはゲームに接続しておらず勝敗を検証できないため、
訂正の判断も同じ精度でしかできないからです。誤りは確定前に解き、繰り返す者は通報の累積で
BAN します（ADR-033）。

## 開発

### 必要なもの

- [Bun](https://bun.sh/)
- [Deno](https://deno.com/) v2
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker（Supabase Local の起動に使う）

### 起動

```bash
bun install
supabase start
supabase db reset

# Edge Functions（別ターミナル）
# ★SUPABASE_DB_URL にはコンテナ名を使う。127.0.0.1 では Function から DB へ届かない
echo "SUPABASE_DB_URL=postgresql://postgres:postgres@supabase_db_$(basename "$PWD"):5432/postgres" > .env.ci
supabase functions serve --env-file .env.ci

# フロントエンド（さらに別ターミナル）
bun run dev
```

Discord ログインを試すには Discord アプリの登録が要ります。
手順は [SetupRunbook](docs/project/SetupRunbook.md) の作業1〜2にあります。

### 検証

```bash
bun run lint          # oxlint
bun run format:check  # oxfmt
bun run typecheck     # tsc（Node側）＋ deno check（Deno側）
bun run test:unit     # Vitest
bun run test:integration  # Deno Test
bun run test:db       # pgTAP
bun run test:e2e      # Playwright
```

型検査が2本に分かれるのは、`supabase/functions/**` が Deno コードであり
Node の解決規則では扱えないためです。**片方だけでは全コードを検査できません。**

E2E はルーティングや認証状態の変更を検出できる唯一の層です。
その周辺を触ったときは push 前にローカルで通してください。

### デプロイ

`main` への push では公開されません。**Actions タブから手動で実行します。**

```bash
gh workflow run deploy.yml --ref main

# フロントエンドのみ再公開する場合
gh workflow run deploy.yml --ref main -f skip_backend=true
```

`backend` → `frontend` の順に依存させてあります。新しいフロントエンドが
旧スキーマを参照する時間帯を作らないためです（[11_Deployment.md](docs/design/11_Deployment.md) 9章）。

## ディレクトリ構成

```text
src/                 フロントエンド
supabase/functions/  Edge Functions（Deno）
supabase/migrations/ Database Migration
tests/               Unit / Integration / E2E
scripts/             補助スクリプト
public/              静的ファイル（そのまま配信される）
assets/              配信しない素材（生成物の元データ）
docs/                設計書・運営文書
```

詳細は [00_DirectoryStructure.md](docs/design/00_DirectoryStructure.md) にあります。

## 貢献

変更は Pull Request で行います。`main` はブランチ保護により直接 push できません。
CI は PR でのみ動きます（`main` への push では動きません）。merge した結果は
公開の直前に Deploy が検証します。

承認は不要です（単独運用のため）。CI が通れば自分で merge できます。
保護の設定と緊急時の外し方は [11_Deployment.md](docs/design/11_Deployment.md) 11.2.1 にあります。

設計変更を行う前に [15_DecisionLog.md](docs/design/15_DecisionLog.md) へ ADR を追加してください。
既存の ADR を覆す場合も、本文は改変せず新しい ADR を追加します（履歴を消さないため）。

Migration は追加方式です。**適用済みの Migration を編集してはなりません。**
打ち消す Migration を足して復旧します。

## ライセンス

[MIT License](LICENSE)

fork・改変・再配布・商用利用のいずれも可能です。著作権表示とライセンス条文を残してください。

**無保証です。** 本システムは対戦結果とレートを記録しますが、その正確性・可用性について
作者は責任を負いません。運用上重要なデータを扱う場合は、利用者側でバックアップを取得してください
（[導入・運営ガイド](docs/ForkGuide.md)にSupabaseのバックアップ手順があります）。
