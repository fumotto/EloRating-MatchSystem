# 10_TestSpecification_Part2_Rating.md

# Test Specification — Part 2: レーティング

Version: 2.0
Status: Active
Last Updated: 2026-08-03

方針は `10_TestSpecification.md`（Part1）を参照する。

---

# 1. 対象

* Elo計算（純粋関数）
* 丸め処理とゼロサム性
* レート下限クランプ
* K値の取得と適用
* `rating_history` の登録
* トランザクション

レート計算は TypeScript の純粋関数として実装されるため（ADR-016）、計算そのものは Unit Test で検証する。

---

# 2. 期待値の算出

本章の期待値は `08_RatingSpecification.md` の計算式から手計算した固定値である。

```text
Expected = 1 / (1 + 10 ^ ((OpponentRating - TeamRating) / 400))
DeltaWinner = round(K × (1 - ExpectedWinner))
DeltaLoser  = -DeltaWinner
```

| 条件（K=32）        | ExpectedWinner | DeltaWinner | 勝者結果 | 敗者結果 |
| --------------- | -------------: | ----------: | ---: | ---: |
| 1500 vs 1500    |        0.50000 |          16 | 1516 | 1484 |
| 勝者1500 / 敗者1900 |        0.09091 |          29 | 1529 | 1871 |
| 勝者1900 / 敗者1500 |        0.90909 |           3 | 1903 | 1497 |
| 勝者1000 / 敗者2500 |        0.00018 |          32 | 1032 | 2468 |
| 勝者2500 / 敗者1000 |        0.99982 |           0 | 2500 | 1000 |

テストコード内で上記の式を再実装してはならない（Part1 10.1）。

---

# 3. テストケース

## 3.1 Elo計算（Unit）

| ID            | 観点        | 前提条件                | 操作            | 期待結果                        | 種別   | テスト名                                                     |
| ------------- | --------- | ------------------- | ------------- | --------------------------- | ---- | -------------------------------------------------------- |
| TC-RATING-001 | 同レート      | 両チーム1500、K=32       | calculateRating | 勝者1516・敗者1484               | Unit | `calculates +16/-16 when both teams have equal rating`   |
| TC-RATING-002 | 格下勝利      | 勝者1500・敗者1900、K=32  | calculateRating | 勝者1529・敗者1871               | Unit | `gives a large gain when the underdog wins`              |
| TC-RATING-003 | 格上勝利      | 勝者1900・敗者1500、K=32  | calculateRating | 勝者1903・敗者1497               | Unit | `gives a small gain when the favorite wins`              |
| TC-RATING-004 | 極端なレート差   | 勝者1000・敗者2500、K=32  | calculateRating | 勝者1032・敗者2468               | Unit | `caps the gain at K for an extreme upset`                |
| TC-RATING-005 | 変動量ゼロ     | 勝者2500・敗者1000、K=32  | calculateRating | 双方のレートが変化しない                | Unit | `produces no change when the win is fully expected`      |
| TC-RATING-006 | 期待勝率の算出   | レート差400             | expectedScore | 0.09091（小数第5位まで一致）          | Unit | `computes the expected score from the rating difference` |
| TC-RATING-007 | K値の反映     | 同レート、K=64           | calculateRating | 勝者1532・敗者1468               | Unit | `scales the delta with the configured K factor`          |
| TC-RATING-008 | K値の下限     | 同レート、K=1            | calculateRating | 勝者1501・敗者1499               | Unit | `applies the minimum K factor`                           |
| TC-RATING-009 | K値の上限     | 同レート、K=128          | calculateRating | 勝者1564・敗者1436               | Unit | `applies the maximum K factor`                           |

## 3.2 丸め処理（Unit）

| ID            | 観点         | 前提条件      | 操作      | 期待結果 | 種別   | テスト名                                       |
| ------------- | ---------- | --------- | ------- | ---- | ---- | ------------------------------------------ |
| TC-RATING-010 | 切り捨て側      | 計算結果 15.4 | round() | 15   | Unit | `rounds down below the half`               |
| TC-RATING-011 | 0.5の丸め     | 計算結果 15.5 | round() | 16   | Unit | `rounds half up`                           |
| TC-RATING-012 | 切り上げ側      | 計算結果 15.6 | round() | 16   | Unit | `rounds up above the half`                 |
| TC-RATING-013 | 負値の0.5     | 計算結果 -15.5 | round() | -15  | Unit | `rounds negative halves toward positive infinity` |

## 3.3 ゼロサム性（Unit）

| ID            | 観点        | 前提条件           | 操作              | 期待結果                          | 種別   | テスト名                                                       |
| ------------- | --------- | -------------- | --------------- | ----------------------------- | ---- | ---------------------------------------------------------- |
| TC-RATING-014 | 増減の合計     | 任意のレート組み合わせ    | calculateRating | 勝者の増加量と敗者の減少量の絶対値が一致する        | Unit | `keeps the total rating constant for a single match`       |
| TC-RATING-015 | 独立丸めの回避   | 期待勝率0.5、K=32   | calculateRating | 合計変動が0になる（+16と-16）            | Unit | `does not drift the total rating when both deltas are .5`  |

`08_RatingSpecification.md` 5.2 の規則（勝者の変動量を丸め、敗者へ符号反転値を適用）が守られていることを検証する。

## 3.4 レート下限クランプ（Unit）

| ID            | 観点        | 前提条件            | 操作              | 期待結果                            | 種別   | テスト名                                                 |
| ------------- | --------- | --------------- | --------------- | ------------------------------- | ---- | ---------------------------------------------------- |
| TC-RATING-016 | 下限での停止    | 敗者105・勝者100、K=32 | calculateRating | 敗者は100で停止する（89にならない）            | Unit | `clamps the loser rating at the lower bound of 100`  |
| TC-RATING-017 | クランプ時の増減値 | 同上              | calculateRating | 敗者の `ratingChange` は -5（クランプ後の実差） | Unit | `records the actual change after clamping`           |
| TC-RATING-018 | 下限到達済み    | 敗者100が敗北        | calculateRating | 100のまま変化しない                     | Unit | `keeps the rating at the bound when already clamped` |

クランプが発生した場合、ゼロサム性より制約充足を優先する（`08_RatingSpecification.md` 6章）。

## 3.5 レート更新（Integration）

| ID            | 観点             | 前提条件                    | 操作              | 期待結果                                     | 種別          | テスト名                                                        |
| ------------- | -------------- | ----------------------- | --------------- | ---------------------------------------- | ----------- | ----------------------------------------------------------- |
| TC-RATING-019 | 初期レート          | 新規チーム作成                 | create-team     | `rating` が `system_settings.initial_rating` と一致 | Integration | `initializes the team rating from system settings`          |
| TC-RATING-020 | レート保存          | 承認完了                    | approve-match   | `teams.rating` が更新される                    | Integration | `persists the updated ratings`                              |
| TC-RATING-021 | 履歴件数           | 承認完了                    | approve-match   | `rating_history` が2件作成される                | Integration | `creates two rating history rows per match`                 |
| TC-RATING-022 | 更新前レート         | 承認完了                    | rating_history取得 | `before_rating` が正しい                     | Integration | `stores the rating before the update`                       |
| TC-RATING-023 | 更新後レート         | 承認完了                    | rating_history取得 | `after_rating` が正しい                      | Integration | `stores the rating after the update`                        |
| TC-RATING-024 | 増減値            | 承認完了                    | rating_history取得 | `rating_change` = `after - before`       | Integration | `stores the rating change`                                  |
| TC-RATING-025 | 勝敗の記録          | 承認完了                    | rating_history取得 | 勝者が `WIN`、敗者が `LOSE`                     | Integration | `stores the result for each team`                           |
| TC-RATING-026 | K値の保存          | K=64で試合完了               | rating_history取得 | `k_value` が64で保存される                      | Integration | `stores the K factor applied to the match`                  |
| TC-RATING-027 | K値変更後の適用       | 進行中の試合中にK値を32→64へ変更後、承認 | approve-match   | 変更後のK=64で計算される                           | Integration | `uses the K factor at completion time`                      |
| TC-RATING-028 | K値の取得元         | －                       | approve-match   | `system_settings` から取得される（ハードコードでない）     | Integration | `reads the K factor from system settings`                   |
| TC-RATING-029 | 自動承認時のレート更新    | 承認期限切れ                  | auto-resolve-matches | レートが更新され `rating_history` が2件作成される       | Integration | `updates ratings when the match is auto-approved`           |
| TC-RATING-030 | DRAWNではレート更新なし | 申告期限切れ                  | auto-resolve-matches | レートが変化せず `rating_history` が作成されない        | Integration | `does not touch ratings when the match is drawn`            |
| TC-RATING-031 | 拒否ではレート更新なし    | 勝者報告済み                  | reject-match    | レートが変化しない                                | Integration | `does not update ratings on rejection`                      |
| TC-RATING-032 | 申告ではレート更新なし    | 進行中                     | report-match    | レートが変化しない                                | Integration | `does not update ratings on report`                         |

## 3.6 トランザクション（Integration）

| ID            | 観点          | 前提条件            | 操作            | 期待結果                                   | 種別          | テスト名                                                  |
| ------------- | ----------- | --------------- | ------------- | -------------------------------------- | ----------- | ----------------------------------------------------- |
| TC-RATING-033 | コミット        | 正常終了            | approve-match | `matches`・`rating_history`・`teams` が更新される | Integration | `commits all rating updates together`                 |
| TC-RATING-034 | ロールバック      | `teams` 更新で例外   | approve-match | すべての更新が取り消される                          | Integration | `rolls back every write when one step fails`          |
| TC-RATING-035 | 二重更新の防止     | 既に COMPLETED    | approve-match | レートが再更新されず `MATCH-002` を返す             | Integration | `prevents a second rating update for the same match`  |
| TC-RATING-036 | 下限違反時のロールバック | クランプを無効化した場合を想定 | approve-match | CHECK制約違反でロールバックされる                    | Integration | `rolls back when the rating would violate the bound`  |

## 3.7 レートの初期化（Integration）

レートリセット単体の観点（TC-RATING-037〜041）は `admin-reset-ratings` の廃止に伴い削除した
（ADR-031）。**番号は再利用しない。** 初期化はシーズンリセットの一部として検証する
（Part7 の TC-SEASON-005・006）。

# 4. 境界値

| 対象     | 値                                |
| ------ | -------------------------------- |
| K値     | 1 / 32 / 64 / 128（0と129は設定時に拒否）  |
| レート差   | 0 / 1 / 399 / 400 / 401 / 1500   |
| レート下限  | 99 / 100 / 101                   |
| 丸め     | .4 / .5 / .6 / -.5               |

K値の有効範囲は 1〜128 である（`03_Database.md`）。`0` は CHECK制約により設定できないため、レート計算の入力としてテストしない。設定値としての拒否は Part7 で検証する。

---

# 5. 異常系

* 存在しない試合の承認
* `WINNER_REPORTED` 以外の状態からの承認
* 敗者以外による承認
* 既に確定済みの試合の再承認
* K値の取得失敗
* `rating_history` の登録失敗
* `teams` の更新失敗

---

# 6. AI実装ルール

* Elo計算のUnit Testを最優先で実装する。
* 期待勝率・変動量・丸め・クランプを個別に検証する。
* 期待値は本書の固定値を使用し、実装式を再実装しない。
* ゼロサム性（勝者の増加量と敗者の減少量の一致）を必ず検証する。
* クランプ発生時はゼロサム性が崩れることを、意図された挙動として検証する。
* Integration Test では `rating_history` の全列（`k_value` を含む）を検証する。
* `DRAWN` でレートが変化しないことを必ず検証する。
