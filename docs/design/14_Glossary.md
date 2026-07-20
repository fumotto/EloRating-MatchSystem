# 14_Glossary.md

# Ubiquitous Language / Glossary

---

# 1. 目的

本書は、本システムで使用する用語を統一することを目的とする。

ドメインモデル・データベース・API・ソースコード・UI・設計書において、本書で定義した正式名称を使用する。

略称や別名は使用しないことを原則とする。

---

# 2. 命名方針

* ドメイン用語を正式名称とする。
* UI・API・DB・ソースコードで同じ名称を使用する。
* 英語表記を基準とし、日本語は説明として扱う。
* 同じ概念に複数の名称を付けない。

---

# 3. 共通用語

| 正式名称        | 日本語     | システムでの使用例           | 非推奨表現            | 説明               |
| ----------- | ------- | ------------------- | ---------------- | ---------------- |
| Profile     | プロフィール  | `profiles`          | User、Account     | Steamログインした利用者情報 |
| Team        | チーム     | `teams`             | Clan、Guild、Party | 対戦単位となる固定チーム     |
| Team Member | チームメンバー | `team_members`      | Member           | チームに所属するプレイヤー    |
| Team Leader | チームリーダー | `leader_profile_id` | Owner、Captain    | チーム作成者・管理者       |
| Team Invite | チーム招待   | `team_invites`      | Invitation       | チーム参加のための招待      |
| Match       | 試合      | `matches`           | Game、Battle      | 1回の対戦            |
| Match Queue | マッチング待機 | `match_queue`       | Queue            | マッチング待機状態        |
| Rating      | レーティング  | `rating`            | Rate、Elo         | チームの実力値          |
| Ranking     | ランキング   | `rankings`          | Leaderboard      | レーティング順の順位       |
| Season      | シーズン    | `seasons`           | Term             | ランキングの区切り（将来機能）  |

---

# 4. 状態名

| 正式名称      | 用途       |
| --------- | -------- |
| ACTIVE    | 利用可能     |
| INACTIVE  | 無効       |
| WAITING   | マッチング待機中 |
| MATCHED   | 試合成立     |
| PLAYING   | 試合中      |
| COMPLETED | 試合終了     |
| CANCELLED | キャンセル    |
| BANNED    | BAN状態    |

---

# 5. API・DB・コード命名

| 対象              | 方針               |
| --------------- | ---------------- |
| テーブル名           | 複数形・snake_case   |
| カラム名            | snake_case       |
| TypeScript型     | PascalCase       |
| 変数名             | camelCase        |
| 関数名             | camelCase        |
| React Component | PascalCase       |
| 定数              | UPPER_SNAKE_CASE |
| APIパス           | 複数形・kebab-case   |

---

# 6. 禁止事項

* 同一概念に複数の英語名を付けない。
* UIだけ異なる名称を使用しない。
* API・DB・コードで異なる名称を使用しない。
* 略語は正式名称より優先しない。

---

# 7. AI実装ルール

* AIは本書の正式名称を使用する。
* 新しいドメイン用語を追加する場合は、本書を更新してから実装する。
* 命名に迷った場合は、本書を最優先で参照する。
