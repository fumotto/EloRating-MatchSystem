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

| 正式名称            | 日本語      | システムでの使用例                   | 非推奨表現               | 説明                        |
| --------------- | -------- | --------------------------- | ------------------- | ------------------------- |
| Profile         | プロフィール   | `profiles`                  | User、Account        | 認証済み利用者の情報                |
| Team            | チーム      | `teams`                     | Clan、Guild、Party    | 対戦単位となる固定チーム              |
| Team Member     | チームメンバー  | `team_members`              | Member              | チームに所属するプレイヤー             |
| Team Leader     | チームリーダー  | `team_members.role='LEADER'` | Owner、Captain、代表者   | チームを管理する権限を持つメンバー         |
| Team Invite     | チーム招待    | `team_invites`              | Invitation          | チーム参加のための招待               |
| Match           | 試合       | `matches`                   | Game、Battle         | 1回の対戦                     |
| Match Queue     | マッチング待機  | `matching_queue`            | Queue               | マッチング待機状態                 |
| Match Report    | 勝利申告     | `report-match`              | 結果報告、Submit         | 勝者チームが試合結果を申告する操作         |
| Match Approval  | 承認       | `approve-match`             | 確認、Confirm          | 敗者チームが申告内容を承認する操作         |
| Match Rejection | 拒否       | `reject-match`              | 否認、Deny             | 敗者チームが申告内容を拒否する操作         |
| Rating          | レーティング   | `rating`                    | Rate、Elo、スコア        | チームの実力値                   |
| Rating History  | レート履歴    | `rating_history`            | Log、Record          | 試合ごとのレート変動記録              |
| K Factor        | K値       | `rating_k`                  | K係数、Kファクター          | レート変動幅を決める係数              |
| Expected Score  | 期待勝率     | －                           | 勝率予測                | Elo計算で用いる勝利期待値            |
| Ranking         | ランキング    | `team_ranking_view`         | Leaderboard         | レーティング順の順位                |
| System Settings | システム設定   | `system_settings`           | Config、Preference   | 管理者が変更できる全体設定             |
| Audit Log       | 監査ログ     | `audit_logs`                | 操作ログ、History        | 管理操作・結果確定・認証失敗などの追記専用記録   |
| Admin           | 管理者      | `app_metadata.role='admin'` | Moderator、Operator  | システム全体を管理する権限を持つ利用者。Supabase側で指定する |
| Auth Provider   | 認証プロバイダ  | `auth_provider`             | SNS連携、外部認証          | ログインに用いる外部OAuth提供者        |
| App Metadata    | アプリメタデータ | `app_metadata`              | ユーザーメタデータ           | Supabase Authが保持し、service_roleのみ更新できるJWTクレーム |
| Season          | シーズン     | `seasons`                   | Term                | ランキングの区切り（将来機能）           |

---

# 4. 状態名

状態値は対象ごとに定義する。ここに定義のない状態値を使用してはならない。

## Match（`matches.status`）

| 正式名称            | 用途                       |
| --------------- | ------------------------ |
| PLAYING         | 試合成立から結果申告までの進行中状態       |
| WINNER_REPORTED | 勝者が申告し、敗者の承認を待つ状態        |
| COMPLETED       | 結果が確定し、レートを更新した状態        |
| DRAWN           | 引き分けまたは時間切れにより解散した状態     |

`MATCHED` および `IN_PROGRESS` は使用しない（ADR-008）。

---

## Team Member（`team_members.role`）

| 正式名称   | 用途          |
| ------ | ----------- |
| LEADER | チームを管理する権限者 |
| MEMBER | 一般メンバー      |

`OWNER` は使用しない（ADR-010）。

---

## Team Invite（`team_invites.status`）

| 正式名称    | 用途      |
| ------- | ------- |
| ACTIVE  | 利用可能    |
| USED    | 使用済み    |
| EXPIRED | 有効期限切れ  |
| REVOKED | 取り消し済み  |

---

## Rating History（`rating_history.result`）

| 正式名称 | 用途 |
| ---- | -- |
| WIN  | 勝利 |
| LOSE | 敗北 |

引き分け（`DRAWN`）ではレートを更新しないため、`rating_history` を作成しない。

---

## Team のBAN状態

チームに状態列は持たない。BANは `teams.is_banned`（真偽値）で表す。

進行中の試合の有無は `matches` から導出する。`teams.status` は存在しない。

---

# 5. API・DB・コード命名

| 対象              | 方針                            |
| --------------- | ----------------------------- |
| テーブル名           | 複数形・snake_case                |
| カラム名            | snake_case                    |
| Edge Function名  | 動詞始まりの kebab-case（例 `create-team`） |
| View名           | 用途＋`_view`（例 `team_ranking_view`） |
| TypeScript型     | PascalCase                    |
| 変数名             | camelCase                     |
| 関数名             | camelCase                     |
| React Component | PascalCase                    |
| 定数              | UPPER_SNAKE_CASE              |
| エラーコード          | `<カテゴリ>-<3桁連番>`（06_ErrorCode.md） |

本システムはREST APIを提供しないため、APIパスの命名規則は定義しない。
クライアントは Edge Function 名でバックエンドを呼び出す。

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
* 命名に迷った場合は本書を参照する。ただし文書間に矛盾がある場合は、Project Constitution 第9条の優先順位に従う。
