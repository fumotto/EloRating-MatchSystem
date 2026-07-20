# 12_TechnologyStack.md

# Technology Stack Specification

---

# 1. 目的

本書は、本システムで採用する技術スタック、ライブラリ、開発ツールおよび採用方針を定義する。

本書を技術選定の基準とし、実装時は本書に従う。

---

# 2. 基本方針

* OSSを優先して採用する。
* 長期サポート・コミュニティの活発さを重視する。
* AIエージェントによる実装・保守がしやすい技術を選定する。
* 不要なライブラリは追加しない。

---

# 3. フロントエンド

| 項目            | 採用技術            | 採用理由                          |
| ------------- | --------------- | ----------------------------- |
| Runtime       | Bun             | 高速な実行・ビルド・パッケージ管理を統合できるため     |
| Language      | TypeScript      | 型安全性とAIによるコード生成との相性が良いため      |
| Framework     | React（最新版）      | 豊富な実績とエコシステムのため               |
| Build Tool    | Vite            | 高速な開発体験とGitHub Pagesとの相性が良いため |
| UI Components | shadcn/ui       | カスタマイズ性・アクセシビリティ・保守性に優れるため    |
| Styling       | Tailwind CSS    | ユーティリティファーストで保守しやすいため         |
| Routing       | TanStack Router | 型安全なルーティングを実現するため             |
| Data Fetching | TanStack Query  | サーバー状態管理を効率化するため              |
| Form          | React Hook Form | フォーム管理とバリデーションを簡潔に実装できるため     |
| Validation    | Zod             | TypeScriptとの親和性が高いため          |

---

# 4. バックエンド

| 項目             | 採用技術                        | 採用理由                           |
| -------------- | --------------------------- | ------------------------------ |
| BaaS           | Supabase                    | 認証・DB・Realtime・Storageを統合できるため |
| Database       | PostgreSQL                  | 信頼性・拡張性に優れるため                  |
| Authentication | Supabase Auth + Steam OAuth | Steamアカウントによるログインを実現するため       |
| API            | Supabase Edge Functions     | バックエンドロジックを実装するため              |
| Realtime       | Supabase Realtime           | マッチ成立や試合状態をリアルタイム通知するため        |
| Storage        | Supabase Storage            | 将来の画像・アイコン保存に備えるため             |

---

# 5. テスト

| 項目             | 採用技術                  | 採用理由                        |
| -------------- | --------------------- | --------------------------- |
| Unit Test      | Vitest                | Viteとの親和性が高く高速なため           |
| Component Test | React Testing Library | ユーザー視点でUIを検証するため            |
| E2E Test       | Playwright            | 主要ブラウザを対象に一貫したE2Eテストを実現するため |

---

# 6. 品質管理

| 項目        | 採用技術   | 採用理由                 |
| --------- | ------ | -------------------- |
| Formatter | oxfmt  | 高速で一貫したコード整形を行うため    |
| Linter    | oxlint | 高速な静的解析を行うため         |
| Git Hooks | （導入予定） | コミット前の品質チェックを自動化するため |

---

# 7. CI/CD

| 項目              | 採用技術           | 採用理由             |
| --------------- | -------------- | ---------------- |
| Source Control  | GitHub         | ソースコード管理         |
| CI/CD           | GitHub Actions | ビルド・テスト・デプロイの自動化 |
| Hosting         | GitHub Pages   | フロントエンド配信        |
| Backend Hosting | Supabase       | バックエンドサービス提供     |

---

# 8. ディレクトリ構成（概要）

```text
/
├── docs/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── hooks/
│   ├── lib/
│   ├── routes/
│   ├── services/
│   ├── stores/
│   ├── types/
│   └── utils/
├── supabase/
│   ├── functions/
│   ├── migrations/
│   └── seed/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── public/
```

---

# 9. バージョン管理方針

* アプリケーションは Semantic Versioning を採用する。
* Gitタグをリリースバージョンとする。
* Database Migration は追加方式とし、既存Migrationは変更しない。
* APIはMVP期間中は単一バージョンで運用し、互換性を維持する。

---

# 10. コーディング方針

* TypeScriptの型安全性を最大限活用する。
* `any`型の使用は禁止する。
* 共通処理はユーティリティまたはカスタムフックへ切り出す。
* ビジネスロジックをUIコンポーネントへ直接記述しない。
* 命名規則は一貫性を保つ。

---

# 11. 採用しない技術

* Redux（TanStack Query と React Context を優先するため）
* CSS Modules（Tailwind CSS を採用するため）
* JavaScript（TypeScriptへ統一するため）

---

# 12. AI実装ルール

* 本書に記載された技術以外を採用する場合は、設計変更として DecisionLog に記録する。
* ライブラリ追加時は採用理由を明記する。
* バージョンアップ時は互換性を確認し、関連ドキュメントを更新する。
* 技術選定に迷った場合は、本書を優先して判断する。
