// マッチング成立時に見せるレート変動の予測（Issue #5）。
//
// ★計算式を再実装しない。Edge Functions と同じ `_shared/rating.ts` を使う。
//   ここで独自に書くと、確定時に実際へ適用される値と表示がずれる。
//   ずれは「表示と違う点数になった」という不信につながり、
//   レーティングという仕組み自体の信頼を損なう。
//
// ★あくまで予測である。確定は敗者の承認時に行われ、その時点の
//   system_settings.rating_k と両チームのレートで再計算される（08 5.1）。
//   待機中に他の試合が確定してレートが動けば、実際の値は変わりうる。
import { calculateRating } from "../../supabase/functions/_shared/rating.ts";

export interface RatingProjection {
  /** 勝った場合の増加量（正の値） */
  win: number;
  /** 負けた場合の減少量（正の値として返す。表示側で符号を付ける） */
  lose: number;
}

export function projectRatingChange(
  myRating: number,
  opponentRating: number,
  kValue: number,
): RatingProjection {
  const asWinner = calculateRating(myRating, opponentRating, kValue);
  const asLoser = calculateRating(opponentRating, myRating, kValue);

  return {
    win: asWinner.winnerChange,
    // 敗者側の変動は負の値で返るため、表示用に絶対値へ直す。
    // ★下限（100）に達している場合、減少量は勝者の増加量より小さくなる（6章）。
    lose: Math.abs(asLoser.loserChange),
  };
}
