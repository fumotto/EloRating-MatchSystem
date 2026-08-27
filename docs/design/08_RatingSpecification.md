# 08_RatingSpecification.md

# Rating Specification

Version: 2.0
Status: Active
Last Updated: 2026-08-03
準拠ADR: ADR-004, ADR-008, ADR-014, ADR-016

---

# 1. 目的

本書は本システムで採用する Elo レーティングシステムの仕様を定義する。

レーティングはチーム単位で管理する。個人レーティングは保持しない。

本書は以下の正本である。

* Elo計算式
* K値・初期レート・レート下限
* 丸め規則
* レート更新の契機

---

# 2. 基本仕様

| 項目       | 値                        |
| -------- | ------------------------ |
| レーティング方式 | Elo Rating               |
| 管理単位     | チーム                      |
| 初期レート    | `system_settings.initial_rating`（初期値 1500） |
| K値       | `system_settings.rating_k`（初期値 32）        |
| レート下限    | 100                      |
| 保存単位     | 整数                       |
| 引き分け     | レート変動なし                  |

初期レートとK値は設定値であり、コードへハードコードしない。表中の数値は Seed の初期値である。

---

# 3. レーティング更新の契機

レート更新は以下のいずれかで実行する。

| 契機             | 実行主体                   | 遷移                                       |
| -------------- | ---------------------- | ---------------------------------------- |
| **敗者チームによる投了** | `concede-match`        | `PLAYING → COMPLETED` / `WINNER_REPORTED → COMPLETED` |
| 敗者チームによる承認     | `approve-match`        | `WINNER_REPORTED → COMPLETED`            |
| 承認期限切れの自動承認    | `auto-resolve-matches` | `WINNER_REPORTED → COMPLETED`            |

**投了は `PLAYING` からも直接確定する**（ADR-032 ①）。更新前の状態が `WINNER_REPORTED` に
限られていた前提は、投了の導入により変わった。

**実装は3経路で共有する。** レート更新を複数箇所へ重複させてはならない（10.1）。

以下ではレートを更新しない。

| 状態・操作           | 理由                     |
| --------------- | ---------------------- |
| `report-match`     | 申告のみ。承認前は確定していない                     |
| 反対申告               | 主張の記録のみ。確定していない                      |
| `extend-match-deadline` | 期限の延長のみ                             |
| `request-no-contest` / `respond-no-contest` | 対戦が成立していない        |
| `admin-void-match` | 運営起因・外部起因の無効化                        |
| 通報および措置            | **勝敗フローから独立している**（ADR-033 ①）         |
| `DRAWN`            | 5種類すべてでレートを変えない                      |

**★`reject-match` は廃止した**（ADR-032 ②）。

**★確定した試合のレートを事後に変更する手段は存在しない**（ADR-033 ①）。
管理者裁定・追記訂正・遡及再計算のいずれも採用しない。誤りは確定前に解く。

---

# 4. レーティング計算式

## 期待勝率（Expected Score）

```text
Expected = 1 / (1 + 10 ^ ((OpponentRating - TeamRating) / 400))
```

## レート変動量

```text
Delta = K × (Actual - Expected)
```

| 結果 | Actual |
| -- | -----: |
| 勝利 |      1 |
| 敗北 |      0 |

引き分けはレートを更新しないため、`Actual = 0.5` を計算に用いることはない。

---

# 5. 丸め処理とゼロサム性

## 5.1 規則

**勝者の変動量を四捨五入で確定し、敗者にはその符号を反転した値を適用する。**

```text
DeltaWinner = round(K × (1 - ExpectedWinner))
DeltaLoser  = -DeltaWinner

NewWinnerRating = clamp(WinnerRating + DeltaWinner)
NewLoserRating  = clamp(LoserRating  + DeltaLoser)
```

`round()` は小数第1位を四捨五入して整数化する（0.5は切り上げ）。

## 5.2 この規則を採用する理由

両チームの変動量を独立に四捨五入すると、1試合あたりの増減の合計が0にならず、系全体の総レートが試合ごとに漂流する。

例：期待勝率が互いに0.5、K=32の場合

```text
独立に丸めた場合
  勝者 1512.5 → 1513（+16）
  敗者 1487.5 → 1488（-15.5 を丸めて -15）
  合計 +1 の増加が発生する
```

勝者の変動量のみを丸めて敗者へ符号反転値を適用すれば、1試合の増減の合計は常に0になる。

## 5.3 丸めの例

| 計算結果   | 保存値  |
| ------ | ---- |
| 1512.4 | 1512 |
| 1512.5 | 1513 |
| 1512.9 | 1513 |

丸めは保存直前に一度だけ実施する。中間計算では丸めない。

---

# 6. レート下限

レートの下限を **100** とする。

```text
clamp(rating) = max(rating, 100)
```

下限を設ける理由は、`teams.rating` および `rating_history.after_rating` のCHECK制約（`>= 100`）との整合を保ち、極端なレート差が続いた場合に制約違反でトランザクションが失敗することを防ぐためである。

下限に達した場合の扱い。

* 敗者のレートは100未満にならない。
* この場合、勝者と敗者の変動量の絶対値が一致しなくなる。ゼロサム性より制約充足を優先する。
* `rating_history.rating_change` にはクランプ後の実際の増減値を保存する。

---

# 7. K値

K値は `system_settings.rating_k` に保持する。管理者が変更できる。

有効範囲は 1〜128 とする（`03_Database.md` の CHECK制約）。

## 7.1 適用タイミング

**レート計算は試合の完了時点で行われ、その時点の `rating_k` を使用する。**

したがって、K値の変更は進行中の試合にも影響する。進行中に変更された場合、その試合は新しいK値で計算される。

「次回の試合から適用」ではない点に注意する。試合単位でK値を固定する仕組みは持たない。

## 7.2 監査

適用されたK値は `rating_history.k_value` に保存する。

これによりK値変更後も、過去の各試合がどのK値で計算されたかを検証できる。

---

# 8. 初期レート

新規チーム作成時に `system_settings.initial_rating` を設定する。

`teams.rating` のDEFAULT値（1500）はSeedの初期値と一致させるが、実際の設定はEdge Functionが `system_settings` から取得して行う。

---

# 9. レート更新処理

```text
承認（手動または自動）
  ↓
BEGIN
  ↓
現在レートを取得（両チーム）
  ↓
system_settings から rating_k を取得
  ↓
期待勝率を計算
  ↓
勝者の変動量を算出し四捨五入
  ↓
敗者へ符号反転値を適用
  ↓
下限クランプ
  ↓
matches UPDATE（COMPLETED）
  ↓
rating_history INSERT ×2（k_value を含む）
  ↓
teams UPDATE ×2
  ↓
COMMIT
```

これらは単一トランザクションで実行する。

---

# 10. 実装方式

ADR-016により、レート計算は **TypeScriptの純粋関数** として実装する。

```typescript
interface RatingResult {
    winnerBefore: number;
    winnerAfter: number;
    loserBefore: number;
    loserAfter: number;
    delta: number;
    kValue: number;
}

function calculateRating(
    winnerRating: number,
    loserRating: number,
    k: number,
): RatingResult;
```

## 10.1 制約

* データベース関数（PL/pgSQL）としてレート計算を実装してはならない。単体テストが困難になるためである。
* 計算ロジックは共通モジュールへ集約し、`approve-match` と `auto-resolve-matches` の双方から利用する。複数箇所へ重複実装してはならない。
* 純粋関数とし、DB接続や現在時刻へ依存させない。

---

# 11. rating_history

1試合につき2件（両チーム分）を登録する。

保持項目は `03_Database.md` 10.7 を正本とする。

| 項目            | 内容                          |
| ------------- | --------------------------- |
| before_rating | 更新前レート                      |
| after_rating  | 更新後レート                      |
| rating_change | 増減値（`after - before`）       |
| k_value       | 適用したK値                      |
| result        | `WIN` / `LOSE`              |
| completed_at  | 試合確定日時                      |

`DRAWN` の試合は `rating_history` を作成しない。結果として `team_ranking_view` の戦績にも計上されない。

シーズンリセットによるレートの初期化は `rating_history` へ登録しない。`audit_logs` へ記録する（ADR-017）。

---

# 12. 管理者が変更できる設定

| 項目            | 設定キー             | 影響                    |
| ------------- | ---------------- | --------------------- |
| K値            | `rating_k`       | 以後に完了する試合のレート計算       |
| 初期レート         | `initial_rating` | 以後に作成されるチーム、およびシーズンリセット |

シーズンリセット（`finalize-season`）は全チームのレートを初期値へ戻す。

リセットは進行中の試合が存在しない場合のみ実行できる。レート計算の整合性を保つためである。

---

# 13. シーズン

MVPではシーズンを採用しない。

レートを初期化する経路はシーズンリセットのみである。単発の `admin-reset-ratings` は廃止した（ADR-031）。
退避を伴わない初期化を残すと、前期の順位が復元不能な形で失われる操作を運営が誤って選べてしまう。

---

# 14. AI実装ルール

* レート更新は `concede-match`・`approve-match`・`auto-resolve-matches` のみで実行する。
* `report-match`・反対申告・期限の延長・不成立の申請ではレートを更新しない。
* **確定後にレートを変更してはならない。** 訂正の手段は存在しない（ADR-033 ①）。
* **通報からレートへ至る経路を実装してはならない**（ADR-033 ②）。
* `DRAWN` ではレートを更新せず、`rating_history` も作成しない。
* レート更新は必ずトランザクション内で実行する。
* 丸めは保存直前に一度だけ実施する。
* 勝者の変動量を丸め、敗者には符号反転値を適用する（ゼロサム性の担保）。
* 下限クランプ（100）を必ず適用する。
* K値・初期レートは `system_settings` から取得する。ハードコードしない。
* 適用したK値を `rating_history.k_value` へ保存する。
* レート計算はTypeScriptの純粋関数として実装し、DB関数として実装しない。
* 過去の `rating_history` を更新・削除しない。
