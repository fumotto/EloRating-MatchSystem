// Eloレート計算（08_RatingSpecification.md 4〜6章 / ADR-016）。
//
// 純粋関数であり、DB接続にも現在時刻にも依存しない（08_RatingSpecification.md 10.1）。
// K値・初期レートはハードコードせず、呼び出し側が system_settings から取得して渡す。
// `approve-match` と `auto-resolve-matches` の双方が本モジュールを使う。重複実装してはならない。

// レート下限。teams.rating と rating_history.after_rating の CHECK制約（>= 100）と対応する
// （08_RatingSpecification.md 6章）。制約側を変える場合は 03_Database.md が正本である。
export const RATING_LOWER_BOUND = 100;

export interface RatingResult {
  winnerBefore: number;
  winnerAfter: number;
  loserBefore: number;
  loserAfter: number;
  // 丸め済みの勝者の変動量。敗者へは符号反転値を適用する（5.1）。
  delta: number;
  kValue: number;
  // クランプ後の実際の増減値。rating_history.rating_change へ保存する（6章・11章）。
  // 下限に達した試合では |loserChange| < |winnerChange| となり、delta とは一致しない。
  winnerChange: number;
  loserChange: number;
}

// 小数第1位を四捨五入する。0.5は切り上げる（08_RatingSpecification.md 5.1）。
// 負値の -15.5 は -15（正の無限大方向）となる。Math.round がこの規則そのものである。
export function round(value: number): number {
  return Math.round(value);
}

// 期待勝率。Expected = 1 / (1 + 10 ^ ((OpponentRating - TeamRating) / 400))
export function expectedScore(teamRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - teamRating) / 400));
}

const clamp = (rating: number): number => Math.max(rating, RATING_LOWER_BOUND);

// 引き分けはレートを更新しないため、本関数は勝者と敗者が確定した試合にのみ適用する
// （Actual = 0.5 を用いることはない / 08_RatingSpecification.md 4章）。
export function calculateRating(
  winnerRating: number,
  loserRating: number,
  k: number,
): RatingResult {
  // ★丸めは保存直前に一度だけ。中間計算では丸めない（5章）。
  const delta = round(k * (1 - expectedScore(winnerRating, loserRating)));

  // 敗者は独立に丸めず、勝者の変動量の符号反転値を適用する。
  // 独立に丸めると1試合あたりの増減の合計が0にならず、系全体の総レートが漂流する（5.2）。
  const winnerAfter = clamp(winnerRating + delta);
  const loserAfter = clamp(loserRating - delta);

  return {
    winnerBefore: winnerRating,
    winnerAfter,
    loserBefore: loserRating,
    loserAfter,
    delta,
    kValue: k,
    winnerChange: winnerAfter - winnerRating,
    loserChange: loserAfter - loserRating,
  };
}
