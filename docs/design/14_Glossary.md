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
| Match Concession | 投了      | `concede-match`             | 降参、Surrender、Give up | **敗者チームが自チームの敗北を申告する操作。基本の経路**（ADR-032 ①） |
| Counter Claim   | 反対申告     | `counter_claim_team_id`     | 異議、Dispute、否認       | 申告された勝敗に対し、相手チームが自チームの勝利を申告する操作（ADR-032 ⑩） |
| No Contest      | 不成立      | `request-no-contest`        | 中止、Cancel、無効試合      | 対戦が成立しなかったことの申請。結末は相手の応答で決まる（ADR-032 ⑧） |
| Prepared Match  | 用意した試合   | `admin-create-match`        | 手動マッチ、カスタムマッチ       | 管理者が対戦カードを直接作成した試合。確定フローは通常と同じ（ADR-039 ①） |
| Season Cutoff   | シーズンによる打ち切り | `no_contest_reason='SEASON_END'` | シーズン終了、リセット中止 | シーズン確定時に決着していない試合を打ち切ること。不利益は伴わない（ADR-038 ①） |
| Abuse Report    | 通報       | `abuse_reports`             | 異議申し立て、Dispute、Report | 不正・迷惑行為の申告。**勝敗フローから独立し、結果を覆さない**（ADR-033） |
| Queue Cooldown  | クールダウン   | `teams.queue_cooldown_until` | ペナルティ、BAN           | 一定時間マッチング待機列へ入れない状態（ADR-032 ④） |
| Match Avoidance | 再マッチ抑止   | `match_avoidance`           | ブロック、ミュート           | 特定のペアを一定期間マッチさせない登録（ADR-034 ③） |
| Rematch Cooldown | ペア再戦の抑止 | `rematch_cooldown_hours`    | 連戦制限、対戦制限            | 確定した試合のペアを一定時間マッチさせない仕組み（ADR-036 ①） |
| Rating          | レーティング   | `rating`                    | Rate、Elo、スコア        | チームの実力値                   |

## 3.1 廃止した用語（ADR-032）

| 廃止した用語          | 旧表現                | 置き換え先                        |
| --------------- | ------------------ | ---------------------------- |
| Match Rejection | 拒否 / `reject-match` | Counter Claim（反対申告）／Abuse Report（通報） |

**「拒否」という語を使わない。** 敗者が単独で試合を消せた操作であり、廃止した（ADR-032 ②③）。
反論は「勝ったのは我々だ」という**反対申告**として行い、不正の申し立ては勝敗フローの外で**通報**として行う。

**★`Report` を単独で使わない。** 本システムには意味の異なる2つの「報告」がある。

| 語               | 指すもの        | 識別子             |
| --------------- | ----------- | --------------- |
| Match Report    | 勝利の申告       | `report-match`  |
| Abuse Report    | 不正・迷惑行為の通報  | `abuse_reports` |

識別子では必ず修飾する。`reports` というテーブル名や `create-report` という Function 名を用いてはならない。

## 3.2 同時参加の呼称（ADR-035）

**「1チーム同時1試合」という表現を使わない。** 規則は試合の本数ではなく待機列への入り口にある。

| 正しい表現                            | 使わない表現       |
| -------------------------------- | ------------ |
| 進行中の試合を持つチームは待機列に登録できない          | 1チーム同時1試合    |
| 進行中の試合（`status NOT IN ('COMPLETED','DRAWN')`） | アクティブな試合、試合中状態 |

将来「管理者がマッチを用意する」運用では、1チームが同時に複数の試合を持つ（ADR-035 ⑤）。

## 3.3 紛らわしい名前（ADR-038 備考）

**`SEASON_END` と `SEASON_END_STARTED` は別の概念である。** 名前が近いため取り違えやすい。

| 名前                  | 置き場所                    | 意味                     |
| ------------------- | ----------------------- | ---------------------- |
| `SEASON_END`        | `matches.no_contest_reason` | 試合が打ち切られた**理由**        |
| `SEASON_END_STARTED` | `audit_logs.action`     | シーズン終了**操作**の記録        |

前者は試合に、後者はシーズンに属する。列が違えば同じ語を含んでもよいが、
**文章の中では「シーズンによる打ち切り」「シーズン終了の開始」と言い分ける。**

## 3.4 サブアカウント対策の呼称（ADR-036）

**「不正検知」「スマーフ判定」という表現を使わない。** 本システムは同一人物を同定しない。

| 正しい表現                          | 使わない表現                     |
| ------------------------------ | -------------------------- |
| 対戦の偏り、疑わしいペア                   | 不正検知、チート検知、スマーフ判定          |
| 同時在席の欠如                        | 同一人物の証拠、なりすまし判定            |
| ペア再戦の抑止                        | サブアカウント対策（機構の名前としては使わない）   |
| 掲載条件を満たさない                     | ランキングから除外された、BANされた        |

**「疑い」と「証拠」を言い分けること。** `suspicious_pair_view` が返すのは疑いであり、
措置の根拠になるのは管理者の判断である（ADR-036 ④）。文言がこれを混同すると、
機械の出力がそのまま処分の理由に読まれる。
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
| Integrity Signal | 対戦の偏り    | `suspicious_pair_view`      | 不正検知、Cheat Detection、スマーフ判定 | サブアカウントの疑いを管理者へ示す材料。**判定ではない**（ADR-036 ④） |
| Concurrency Gap | 同時在席の欠如  | `never_concurrent`          | －                   | 2チームが同じ時刻に別々の試合へ出たことが一度も無いこと（ADR-036 ④） |

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
