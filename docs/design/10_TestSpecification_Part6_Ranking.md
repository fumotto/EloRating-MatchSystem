# 10_TestSpecification_Part6_Ranking.md

# Test Specification — Part 6: ランキング

Version: 2.0
Status: Active
Last Updated: 2026-08-03

方針は `10_TestSpecification.md`（Part1）を参照する。

---

# 1. 対象

* `team_ranking_view`
* Ranking Query
* 順位の採番
* 未認証での公開（ADR-018）

---

# 2. 前提

* ランキングは未認証でも閲覧できる（ADR-018）。
* BANチームはView側で除外済みである。クライアントで除外しない。
* 戦績は `rating_history` から集計する。`DRAWN` は履歴を作らないため計上されない。
* 順位は `RANK()` により採番する。同率は同順位とし、次の順位を飛ばす。
* 試合を1度も行っていないチームも表示される（LEFT JOIN）。

---

# 3. テストケース

## 3.1 取得と並び順

| ID          | 観点         | 前提条件              | 操作            | 期待結果                    | 種別          | テスト名                                              |
| ----------- | ---------- | ----------------- | ------------- | ----------------------- | ----------- | ------------------------------------------------- |
| TC-RANK-001 | 一覧取得       | チームが存在            | Ranking Query | 一覧を取得できる                | Integration | `returns the ranking list`                        |
| TC-RANK-002 | レート降順      | レートの異なる複数チーム      | Ranking Query | `rating` の降順で並ぶ         | Integration | `sorts teams by rating descending`                |
| TC-RANK-003 | 同レートの並び    | 同一レートで勝数が異なるチーム   | Ranking Query | 勝数の降順で並ぶ                | Integration | `breaks rating ties by wins`                      |
| TC-RANK-004 | 完全同条件の並び   | レート・勝数が同一         | Ranking Query | チーム名の昇順で並ぶ              | Integration | `breaks remaining ties by team name`              |
| TC-RANK-005 | 空ランキング     | チームが存在しない         | Ranking Query | 空配列を返す                  | Integration | `returns an empty list when no team exists`       |

## 3.2 順位の採番

| ID          | 観点         | 前提条件                | 操作            | 期待結果                | 種別          | テスト名                                            |
| ----------- | ---------- | ------------------- | ------------- | ------------------- | ----------- | ----------------------------------------------- |
| TC-RANK-006 | 順位の付与      | 複数チーム               | Ranking Query | `rank` が1から順に付与される  | Integration | `assigns a rank to every team`                  |
| TC-RANK-007 | 同率順位       | 同一レートのチームが2つ        | Ranking Query | 両者が同一の `rank` を持つ   | Integration | `gives the same rank to teams with equal rating` |
| TC-RANK-008 | 同率後の順位     | 1位が2チーム、その次のチーム     | Ranking Query | 次のチームは3位となる（2位は存在しない） | Integration | `skips the rank after a tie`                    |

## 3.3 戦績の集計

| ID          | 観点             | 前提条件              | 操作            | 期待結果                  | 種別          | テスト名                                                  |
| ----------- | -------------- | ----------------- | ------------- | --------------------- | ----------- | ----------------------------------------------------- |
| TC-RANK-009 | 勝数・敗数          | 試合が確定済み           | Ranking Query | `wins`・`losses` が正しい  | Integration | `counts wins and losses`                              |
| TC-RANK-010 | 試合数            | 試合が確定済み           | Ranking Query | `matches` = 勝数 + 敗数   | Integration | `computes the match count`                            |
| TC-RANK-011 | 勝率             | 3勝1敗              | Ranking Query | `winRate` が 0.75      | Integration | `computes the win rate`                               |
| TC-RANK-012 | **試合未実施のチーム**  | 試合を1度も行っていないチーム   | Ranking Query | 一覧に表示され、勝数・敗数・試合数が0   | Integration | `includes teams that have never played`               |
| TC-RANK-013 | **ゼロ除算の回避**    | 試合数0のチーム          | Ranking Query | `winRate` が `null`（例外にならない） | Integration | `returns a null win rate when no match was played`    |
| TC-RANK-014 | **DRAWNの非計上**  | `DRAWN` の試合が存在    | Ranking Query | 試合数・勝数・敗数に含まれない       | Integration | `excludes drawn matches from the record`              |
| TC-RANK-015 | レート更新の反映       | 試合確定後             | Ranking Query | 更新後のレートと順位が反映される      | Integration | `reflects the updated rating`                         |

TC-RANK-012 と TC-RANK-013 は重要である。`rating_history` を内部結合すると試合未実施のチームが一覧から消え、試合数0で除算すると例外またはNaNが発生する。

## 3.4 BANチームの除外

| ID          | 観点          | 前提条件         | 操作            | 期待結果             | 種別          | テスト名                                           |
| ----------- | ----------- | ------------ | ------------- | ---------------- | ----------- | ---------------------------------------------- |
| TC-RANK-016 | BANチームの非表示  | BANされたチームが存在 | Ranking Query | 一覧に含まれない         | Integration | `excludes banned teams from the ranking`       |
| TC-RANK-017 | View側での除外   | 同上           | Ranking Query | クライアントの絞り込みなしで除外される | Integration | `filters banned teams inside the view`         |
| TC-RANK-018 | BAN解除後の再表示  | BAN解除後       | Ranking Query | 一覧に再び表示される       | Integration | `shows the team again after the ban is lifted` |

## 3.5 公開範囲

| ID          | 観点            | 前提条件  | 操作                     | 期待結果                  | 種別          | テスト名                                                 |
| ----------- | ------------- | ----- | ---------------------- | --------------------- | ----------- | ---------------------------------------------------- |
| TC-RANK-019 | **未認証での取得**   | 認証なし  | Ranking Query          | 取得できる                 | Integration | `serves the ranking to anonymous visitors`           |
| TC-RANK-020 | 認証済みでの取得      | 認証あり  | Ranking Query          | 取得できる                 | Integration | `serves the ranking to authenticated users`          |
| TC-RANK-021 | **個人情報の非公開**  | 未認証   | Ranking Query          | プレイヤー名・プロバイダIDを含まない   | Integration | `never exposes player identities in the ranking`     |
| TC-RANK-022 | プロフィールの保護     | 未認証   | profiles SELECT        | 取得できない                | Database    | `keeps profiles private from anonymous visitors`     |
| TC-RANK-023 | Viewの読み取り専用   | 認証済み  | team_ranking_view への更新 | 拒否される                 | Database    | `rejects writes to the ranking view`                 |

## 3.6 ページング

| ID          | 観点        | 前提条件         | 操作            | 期待結果               | 種別          | テスト名                                              |
| ----------- | --------- | ------------ | ------------- | ------------------ | ----------- | ------------------------------------------------- |
| TC-RANK-024 | 件数指定      | 多数のチームが存在    | Ranking Query | 指定件数のみ返る           | Integration | `limits the number of returned rows`              |
| TC-RANK-025 | デフォルト件数   | 指定なし         | Ranking Query | 50件返る              | Integration | `defaults to 50 rows`                             |
| TC-RANK-026 | ページ切替     | Offset指定     | Ranking Query | 次ページが返る            | Integration | `returns the next page by offset`                 |
| TC-RANK-027 | 範囲外のページ   | 総件数を超えるOffset | Ranking Query | 空配列を返す（エラーにしない）    | Integration | `returns an empty page beyond the last row`       |
| TC-RANK-028 | 不正なページサイズ | 負数・0         | Ranking Query | `VALIDATION-003` を返す | Integration | `rejects an invalid page size`                    |
| TC-RANK-029 | 順位の連続性    | 2ページ目を取得     | Ranking Query | `rank` がページを跨いで連続する | Integration | `keeps ranks consistent across pages`             |

## 3.7 Realtime

| ID          | 観点         | 前提条件  | 操作            | 期待結果                     | 種別          | テスト名                                          |
| ----------- | ---------- | ----- | ------------- | ------------------------ | ----------- | --------------------------------------------- |
| TC-RANK-030 | 更新通知       | 試合確定後 | 通知確認          | `RANKING_UPDATED` が送信される | Integration | `publishes RANKING_UPDATED after a match`     |
| TC-RANK-031 | リセット時の通知   | レートリセット後 | 通知確認          | `RANKING_UPDATED` が送信される | Integration | `publishes RANKING_UPDATED after a reset`     |
| TC-RANK-032 | 通知後の再取得    | 通知受信後 | Ranking Query | 最新の順位が取得できる              | Integration | `serves the updated ranking after the event`  |

---

# 4. 境界値

| 対象     | 境界値              |
| ------ | ---------------- |
| チーム数   | 0 / 1 / 2 / 多数   |
| 順位     | 1位 / 最下位         |
| ページサイズ | 0 / 1 / 50 / 最大値 |
| 試合数    | 0 / 1            |
| 勝率     | 0.0 / 0.5 / 1.0 / null |

---

# 5. 異常系

* 存在しないページ番号
* 不正なページサイズ
* DB取得失敗

---

# 6. AI実装ルール

* ランキングはレート降順で取得することを検証する。
* BANチームがView側で除外されることを検証する。
* 試合未実施のチームが一覧から消えないことを必ず検証する。
* 試合数0での勝率がゼロ除算にならないことを必ず検証する。
* `DRAWN` が戦績に計上されないことを検証する。
* 未認証で取得できること、かつ個人情報が含まれないことを検証する。
* 同率順位の採番規則（`RANK()`）を検証する。
