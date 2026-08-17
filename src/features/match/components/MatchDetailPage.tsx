// Page（05_Frontend.md 3.2・9章・14.7）。
//
// ★申告・承認・拒否は version を送る。値はこの画面が取得した Match Detail のものである。
//   MATCH-008 を受けたら再取得して操作をやり直してもらう。自動再送はしない（9章）。
import { useParams, useRouteContext } from "@tanstack/react-router";
import { useMatchDetail } from "../hooks/useMatchDetail";
import { useApproveMatch, useRejectMatch, useReportMatch } from "../hooks/useMatchActions";
import { useMyTeam } from "../../team/hooks/useMyTeam";
import { TeamLink } from "../../team/components/TeamLink";
import { useSystemSettings } from "../../settings/hooks/useSystemSettings";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";
import { remainingTime } from "../../../utils/remainingTime";
import { matchStatusLabel } from "./matchStatusLabel";
import { RatingChangeResult } from "./RatingChangeResult";
import { useMatchRatingResults } from "../hooks/useMatchRatingResults";

export function MatchDetailPage() {
  const { matchId } = useParams({ from: "/_app/matches/$matchId" });
  const { session } = useRouteContext({ from: "/_app" });

  const { data: match, isPending } = useMatchDetail(matchId);
  const { data: myTeam } = useMyTeam(session?.user.id);
  const { data: settings } = useSystemSettings();

  // 確定・引き分けのときだけ取りに行く。進行中は行が存在しない（Issue #6）。
  const isSettled = match?.status === "COMPLETED" || match?.status === "DRAWN";
  const { data: ratingResults } = useMatchRatingResults(matchId, Boolean(isSettled));

  const reportMatch = useReportMatch(matchId);
  const approveMatch = useApproveMatch(matchId);
  const rejectMatch = useRejectMatch(matchId);

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;
  if (!match) return <EmptyState title="試合が見つかりません" />;

  const myTeamId = myTeam?.id;
  const isParticipant = myTeamId === match.teamAId || myTeamId === match.teamBId;
  // 敗者側＝申告された勝者ではない方。承認・拒否ができるのは敗者チームである（ADR-009）。
  const isLoser = Boolean(match.winnerTeamId && isParticipant && myTeamId !== match.winnerTeamId);

  const failureCode =
    apiErrorCode(reportMatch.error) ??
    apiErrorCode(approveMatch.error) ??
    apiErrorCode(rejectMatch.error);

  return (
    <section className="space-y-6">
      <div>
        {/* ★チーム名から相手のメンバーを確認できるようにする。
            誰と当たっているのかは、対戦前に最も知りたい情報である。 */}
        <h1 className="text-xl font-semibold">
          <TeamLink teamId={match.teamAId} teamName={match.teamAName} /> vs{" "}
          <TeamLink teamId={match.teamBId} teamName={match.teamBName} />
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {matchStatusLabel(match.status)}
          {match.winnerTeamId
            ? ` ・ 勝者 ${match.winnerTeamId === match.teamAId ? match.teamAName : match.teamBName}`
            : null}
        </p>
      </div>

      {/* 確定・引き分け時のレート変動（Issue #6）。
          ★全画面を占有しない。相手の承認で不意に確定することがあるためである。 */}
      {isSettled ? (
        <RatingChangeResult
          results={ratingResults ?? []}
          myTeamId={myTeamId}
          isDrawn={match.status === "DRAWN"}
        />
      ) : null}

      {/* 14.7 の期限表示 */}
      <div className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
        {match.status === "PLAYING" ? (
          <p>勝利申告の期限：{remainingTime(match.reportDeadlineAt)}</p>
        ) : null}
        {match.status === "WINNER_REPORTED" ? (
          <>
            <p>承認の期限：{remainingTime(match.approveDeadlineAt)}</p>
            {settings ? (
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                拒否の残り回数：
                {Math.max(settings.max_reject_count - match.rejectCount, 0)} 回
              </p>
            ) : null}
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              期限を過ぎると自動的に承認され、レートが更新されます。
            </p>
          </>
        ) : null}
        {match.status === "DRAWN" ? (
          <p>引き分けとして解散しました（時間切れまたは拒否上限）。レートは変動していません。</p>
        ) : null}
        {match.status === "COMPLETED" ? (
          <p>
            確定済み{match.autoApproved ? "（自動承認）" : ""}
            {match.approvedByName ? ` ・ 承認者 ${match.approvedByName}` : ""}
          </p>
        ) : null}
      </div>

      {/* 申告できるのは勝者チームのメンバーだけである。自チームの勝利のみ申告できる。 */}
      {match.status === "PLAYING" && isParticipant ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">勝利を申告する</h2>
          <button
            type="button"
            disabled={reportMatch.isPending}
            onClick={() =>
              reportMatch.mutate({
                matchId,
                winnerTeamId: myTeamId as string,
                version: match.version,
              })
            }
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {reportMatch.isPending ? "送信中…" : "自チームの勝利を申告"}
          </button>
        </div>
      ) : null}

      {match.status === "WINNER_REPORTED" && isLoser ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">申告への回答</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            申告者 {match.reportedByName ?? "—"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={approveMatch.isPending}
              onClick={() => approveMatch.mutate({ matchId, version: match.version })}
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {approveMatch.isPending ? "送信中…" : "承認する"}
            </button>
            <button
              type="button"
              disabled={rejectMatch.isPending}
              onClick={() => rejectMatch.mutate({ matchId, version: match.version })}
              className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
            >
              {rejectMatch.isPending ? "送信中…" : "拒否する"}
            </button>
          </div>
        </div>
      ) : null}

      {failureCode ? <ErrorNotice code={failureCode} /> : null}
    </section>
  );
}
