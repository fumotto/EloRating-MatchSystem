// 試合確定時のレート変動表示（Issue #6）。
//
// ★全画面を占有しない。確定は自分の操作の直後とは限らず、相手の承認によって
//   不意に起きる。画面を覆う演出だと、別の作業をしている利用者の手を止める。
//   試合画面の中に収める。
//
// ★引き分けはレートが動かない（08_RatingSpecification.md 4章）。
//   「変動なし」と明示する。何も出さないと、更新されていないのか
//   引き分けだったのかを利用者が区別できない。
import { useEffect, useState } from "react";
import type { MatchRatingResult } from "../../../types/api";
// ★下限値は計算側と同じ定数を使う。ここで 100 を直接書くと、
//   仕様変更時に表示だけ古い値のまま残る。
import { RATING_LOWER_BOUND } from "../../../../supabase/functions/_shared/rating.ts";

// カウントの尺。長いと結果を読むまで待たされる。
const COUNT_MS = 900;
const FRAME_MS = 40;

// 動きを望まない利用者には即座に最終値を見せる。
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useCountUp(from: number, to: number): number {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (prefersReducedMotion() || from === to) {
      setValue(to);
      return;
    }

    setValue(from);
    const started = Date.now();

    const timer = setInterval(() => {
      const progress = Math.min((Date.now() - started) / COUNT_MS, 1);
      // 終盤を緩める。数字が止まる瞬間が見えるようにする。
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (to - from) * eased));

      if (progress >= 1) clearInterval(timer);
    }, FRAME_MS);

    return () => clearInterval(timer);
  }, [from, to]);

  return value;
}

export function RatingChangeResult({
  results,
  myTeamId,
  isDrawn,
}: {
  results: MatchRatingResult[];
  myTeamId: string | undefined;
  isDrawn: boolean;
}) {
  const mine = results.find((r) => r.teamId === myTeamId);
  const displayed = useCountUp(mine?.beforeRating ?? 0, mine?.afterRating ?? 0);

  if (isDrawn) {
    return (
      <div
        role="status"
        className="rounded-lg border border-slate-200 px-4 py-3 text-sm dark:border-slate-800"
      >
        引き分けのため、レートは変動していません。
      </div>
    );
  }

  // 確定していない、または自チームが当事者でない場合は何も出さない。
  if (!mine) return null;

  const isWin = mine.result === "WIN";
  const tone = isWin
    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
    : "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950";
  const accent = isWin
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-red-700 dark:text-red-300";

  return (
    <div role="status" className={`rounded-lg border px-4 py-4 ${tone}`}>
      <p className={`text-sm font-medium ${accent}`}>{isWin ? "勝利" : "敗北"}</p>

      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-3xl font-semibold tabular-nums">{displayed}</span>
        <span className={`text-lg font-semibold tabular-nums ${accent}`}>
          {mine.ratingChange >= 0 ? "+" : "−"}
          {Math.abs(mine.ratingChange)}
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        {mine.beforeRating} → {mine.afterRating}
      </p>

      {/* ★下限（100）で止まった場合、減少量が相手の増加量と一致しない（08 6章）。
          説明が無いと「計算が合っていない」と受け取られる。 */}
      {!isWin && mine.afterRating === RATING_LOWER_BOUND ? (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          レートの下限（{RATING_LOWER_BOUND}）に達したため、減少はここで止まっています。
        </p>
      ) : null}
    </div>
  );
}
