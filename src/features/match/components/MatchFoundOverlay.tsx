// マッチング成立の演出（Issue #5）。
//
// ★演出が終わったら該当試合へ移動する。利用者は次に何をすべきか（対戦して結果を申告する）
//   へ直行できる。閉じるだけだと、どこへ行けばよいか分からない。
//
// ★閉じる操作を必ず用意する。自動遷移を待てない人、誤って開いた人のためである。
//   prefers-reduced-motion では動きを止める。
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMatchFoundStore } from "../../../stores/matchFoundStore";
import { useMatchDetail } from "../hooks/useMatchDetail";
import { useMyTeam } from "../../team/hooks/useMyTeam";
import { useSystemSettings } from "../../settings/hooks/useSystemSettings";
import { projectRatingChange } from "../../../utils/ratingProjection";

// 演出の尺。長すぎると邪魔になり、短すぎると内容を読めない。
const AUTO_ADVANCE_MS = 6000;

export function MatchFoundOverlay({ profileId }: { profileId: string | undefined }) {
  const matchId = useMatchFoundStore((s) => s.matchId);
  const dismiss = useMatchFoundStore((s) => s.dismiss);
  const navigate = useNavigate();

  const { data: match } = useMatchDetail(matchId ?? "");
  const { data: myTeam } = useMyTeam(profileId);
  const { data: settings } = useSystemSettings();

  const [leaving, setLeaving] = useState(false);

  // 自動遷移。演出を見せてから試合画面へ送る。
  useEffect(() => {
    if (!matchId) return;

    const timer = setTimeout(() => {
      setLeaving(true);
      dismiss();
      void navigate({ to: "/matches/$matchId", params: { matchId } });
    }, AUTO_ADVANCE_MS);

    return () => clearTimeout(timer);
  }, [matchId, dismiss, navigate]);

  useEffect(() => {
    if (matchId) setLeaving(false);
  }, [matchId]);

  if (!matchId || leaving) return null;
  // 詳細が届くまでは出さない。空の枠が一瞬見えるのを避ける。
  if (!match || !myTeam || !settings) return null;

  const isTeamA = match.teamAId === myTeam.id;
  const opponentName = isTeamA ? match.teamBName : match.teamAName;
  const opponentRating = isTeamA ? match.teamBRating : match.teamARating;
  const myRating = isTeamA ? match.teamARating : match.teamBRating;

  const projection = projectRatingChange(myRating, opponentRating, settings.rating_k);

  const goToMatch = () => {
    setLeaving(true);
    dismiss();
    void navigate({ to: "/matches/$matchId", params: { matchId } });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="対戦相手が決まりました"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm motion-safe:animate-[fadeIn_200ms_ease-out]"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-indigo-500/40 bg-white shadow-2xl motion-safe:animate-[popIn_320ms_cubic-bezier(0.2,0.9,0.3,1.2)] dark:bg-slate-900">
        <div className="bg-indigo-600 px-6 py-4 text-center text-white">
          <p className="text-xs tracking-widest">MATCH FOUND</p>
          <p className="mt-1 text-lg font-semibold">対戦相手が決まりました</p>
        </div>

        <div className="space-y-5 px-6 py-6">
          {/* 対戦カード。自分と相手のレートを並べる。 */}
          <div className="flex items-center justify-between gap-3 text-center">
            <div className="flex-1">
              <p className="truncate text-sm font-medium">{myTeam.name}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{myRating}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">自チーム</p>
            </div>

            <p className="text-sm font-semibold text-slate-400">VS</p>

            <div className="flex-1">
              <p className="truncate text-sm font-medium">{opponentName}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{opponentRating}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">相手</p>
            </div>
          </div>

          {/* 勝敗それぞれの変動予測。 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center dark:border-emerald-900 dark:bg-emerald-950">
              <p className="text-xs text-emerald-800 dark:text-emerald-300">勝ったら</p>
              <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                +{projection.win}
              </p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center dark:border-red-900 dark:bg-red-950">
              <p className="text-xs text-red-800 dark:text-red-300">負けたら</p>
              <p className="text-lg font-semibold tabular-nums text-red-700 dark:text-red-300">
                −{projection.lose}
              </p>
            </div>
          </div>

          {/* ★予測であることを明示する。確定は承認時に再計算される（08 5.1）。 */}
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            変動は予測です。確定時のレートで再計算されます。
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={goToMatch}
              className="flex-1 rounded bg-indigo-600 px-4 py-2 text-sm text-white"
            >
              試合へ進む
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
