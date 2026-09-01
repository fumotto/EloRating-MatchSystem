// Page（05_Frontend.md 3.2・9章・14.6・14.7）。
//
// ★運用の原則は「負けたチームが投了する」である（ADR-032 ①）。
//   勝者申告は敗者が投了しない場合の代替経路であり、画面でも副次に置く。
//
// ★更新系は version を送る。値はこの画面が取得した Match Detail のものである。
//   MATCH-008 を受けたら再取得して操作をやり直してもらう。自動再送はしない（9章）。
import { useState } from "react";
import { useParams, useRouteContext } from "@tanstack/react-router";
import { useMatchDetail } from "../hooks/useMatchDetail";
import {
  useApproveMatch,
  useConcedeMatch,
  useExtendDeadline,
  useReportMatch,
  useRequestNoContest,
  useRespondNoContest,
} from "../hooks/useMatchActions";
import { useMyTeam } from "../../team/hooks/useMyTeam";
import { TeamLink } from "../../team/components/TeamLink";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";
import { remainingTime } from "../../../utils/remainingTime";
import {
  matchStatusLabel,
  noContestLabel,
  noContestReasonLabel,
  NO_CONTEST_REASON_CODES,
} from "./matchStatusLabel";
import { ConcedeDialog } from "./ConcedeDialog";
import { AbuseReportDialog } from "../../abuse/components/AbuseReportDialog";
import { RatingChangeResult } from "./RatingChangeResult";
import { useMatchRatingResults } from "../hooks/useMatchRatingResults";
import type { NoContestReasonCode } from "../../../types/api";

const PRIMARY = "rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50";
const SECONDARY =
  "rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700";
const PANEL = "rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800";

export function MatchDetailPage() {
  const { matchId } = useParams({ from: "/_app/matches/$matchId" });
  const { session } = useRouteContext({ from: "/_app" });

  const { data: match, isPending } = useMatchDetail(matchId);
  const { data: myTeam } = useMyTeam(session?.user.id);

  const [confirmConcede, setConfirmConcede] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [ncReason, setNcReason] = useState<NoContestReasonCode>("CONNECTION");

  const isSettled = match?.status === "COMPLETED" || match?.status === "DRAWN";
  const { data: ratingResults } = useMatchRatingResults(matchId, Boolean(isSettled));

  const reportMatch = useReportMatch(matchId);
  const approveMatch = useApproveMatch(matchId);
  const concedeMatch = useConcedeMatch(matchId);
  const extendDeadline = useExtendDeadline(matchId);
  const requestNoContest = useRequestNoContest(matchId);
  const respondNoContest = useRespondNoContest(matchId);

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;
  if (!match) return <EmptyState title="試合が見つかりません" />;

  const myTeamId = myTeam?.id;
  const isParticipant = myTeamId === match.teamAId || myTeamId === match.teamBId;
  const opponentId = myTeamId === match.teamAId ? match.teamBId : match.teamAId;
  const opponentName = myTeamId === match.teamAId ? match.teamBName : match.teamAName;

  // 自チームが申告した側かどうか。申告した側に操作は無い（撤回は用意しない）。
  const iReported = Boolean(match.winnerTeamId && myTeamId === match.winnerTeamId);
  const isLoserSide = Boolean(match.winnerTeamId && isParticipant && !iReported);
  const contested = match.counterClaimTeamId !== null;
  const ncPending = match.noContestRequestedByTeamId !== null;
  const iRequestedNc = ncPending && match.noContestRequestedByTeamId === myTeamId;

  const failureCode =
    apiErrorCode(reportMatch.error) ??
    apiErrorCode(approveMatch.error) ??
    apiErrorCode(concedeMatch.error) ??
    apiErrorCode(extendDeadline.error) ??
    apiErrorCode(requestNoContest.error) ??
    apiErrorCode(respondNoContest.error);

  const concedeButton = (label: string) => (
    <button type="button" onClick={() => setConfirmConcede(true)} className={PRIMARY}>
      {label}
    </button>
  );

  return (
    <section className="space-y-6">
      <div>
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

      {isSettled ? (
        <RatingChangeResult
          results={ratingResults ?? []}
          myTeamId={myTeamId}
          isDrawn={match.status === "DRAWN"}
        />
      ) : null}

      {/* 14.7 の期限表示 */}
      <div className={PANEL}>
        {match.status === "PLAYING" ? (
          <>
            <p>申告の期限：{remainingTime(match.reportDeadlineAt)}</p>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              残りの延長回数：{match.reportExtensionCount} 回実施済み
            </p>
          </>
        ) : null}
        {match.status === "WINNER_REPORTED" ? (
          <>
            <p>承認の期限：{remainingTime(match.approveDeadlineAt)}</p>
            {contested ? (
              <p className="mt-1 font-medium text-amber-700 dark:text-amber-400">
                双方が勝利を主張しています。<strong>この間は自動承認されません。</strong>
                どちらかが投了しない限り、期限の経過で引き分けとなり、両チームがしばらく待機になります。
              </p>
            ) : (
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                期限を過ぎると自動的に承認されます。放置した側はしばらく待機になります。
              </p>
            )}
          </>
        ) : null}
        {match.status === "DRAWN" ? <p>{noContestLabel(match.noContestReason)}</p> : null}
        {match.status === "COMPLETED" ? (
          <p>
            確定済み
            {match.autoApproved ? "（自動承認：相手が期限内に応答しませんでした）" : ""}
            {match.approvedByName ? ` ・ 承認者 ${match.approvedByName}` : ""}
          </p>
        ) : null}
      </div>

      {/* 保留中の不成立申請。相手の応答で結末が変わる（ADR-032 ⑧） */}
      {match.status === "PLAYING" && ncPending && isParticipant ? (
        <div className={PANEL}>
          <h2 className="font-medium">対戦不成立の申請</h2>
          <p className="mt-1">
            理由：
            {match.noContestReasonCode ? noContestReasonLabel(match.noContestReasonCode) : "—"}
          </p>
          {iRequestedNc ? (
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              相手の応答を待っています。応答が無いまま時間が経つと解散し、
              <strong>応答しなかった側だけ</strong>が待機になります。
            </p>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={respondNoContest.isPending}
                onClick={() =>
                  respondNoContest.mutate({ matchId, response: "ACCEPT", version: match.version })
                }
                className={PRIMARY}
              >
                不成立に同意する
              </button>
              <button
                type="button"
                disabled={respondNoContest.isPending}
                onClick={() =>
                  respondNoContest.mutate({ matchId, response: "CONTINUE", version: match.version })
                }
                className={SECONDARY}
              >
                対戦を続ける
              </button>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            同意による不成立はどちらにも不利益がありません。記録にも計上されません。
          </p>
        </div>
      ) : null}

      {/* PLAYING の操作。★投了を主たる導線に置く（ADR-032 ①） */}
      {match.status === "PLAYING" && isParticipant ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <h2 className="text-sm font-medium">結果を記録する</h2>
            {concedeButton("投了する（負けを認める）")}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              相手の承認は要りません。待ち時間なく、すぐ次のマッチングに入れます。
            </p>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600 dark:text-slate-400">
              相手が投了しない場合の操作
            </summary>
            <div className="mt-3 space-y-3">
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
                className={SECONDARY}
              >
                自チームの勝利を申告
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={extendDeadline.isPending}
                  onClick={() => extendDeadline.mutate({ matchId, version: match.version })}
                  className={SECONDARY}
                >
                  まだ対戦中（期限を延長）
                </button>
              </div>

              {!ncPending ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor="nc-reason">
                    不成立の理由
                  </label>
                  <select
                    id="nc-reason"
                    value={ncReason}
                    onChange={(e) => setNcReason(e.target.value as NoContestReasonCode)}
                    className="rounded border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {NO_CONTEST_REASON_CODES.map((c) => (
                      <option key={c} value={c}>
                        {noContestReasonLabel(c)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={requestNoContest.isPending}
                    onClick={() =>
                      requestNoContest.mutate({
                        matchId,
                        reasonCode: ncReason,
                        version: match.version,
                      })
                    }
                    className={SECONDARY}
                  >
                    この試合は不成立
                  </button>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      ) : null}

      {/* WINNER_REPORTED の操作。★投了と承認を並べない（05_Frontend.md 14.6） */}
      {match.status === "WINNER_REPORTED" && isParticipant ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">申告への回答</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            申告者 {match.reportedByName ?? "—"}
          </p>

          {iReported && !contested ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              相手の応答を待っています。申告は取り消せません。
            </p>
          ) : null}

          {isLoserSide && !contested ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={approveMatch.isPending}
                onClick={() => approveMatch.mutate({ matchId, version: match.version })}
                className={PRIMARY}
              >
                {approveMatch.isPending ? "送信中…" : "承認する"}
              </button>
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
                className={SECONDARY}
              >
                自チームの勝利を申告（申告が誤っている場合）
              </button>
            </div>
          ) : null}

          {contested ? (
            <div className="space-y-2">
              <p className="text-sm">
                主張が食い違っています。相手の主張を認める場合は投了してください。
              </p>
              {concedeButton("投了する（相手の主張を認める）")}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 通報。★勝敗フローから独立している。結果は変わらない（ADR-033） */}
      {isParticipant ? (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="text-sm text-slate-500 underline dark:text-slate-400"
          >
            この試合について通報する
          </button>
        </div>
      ) : null}

      {failureCode ? <ErrorNotice code={failureCode} /> : null}

      {confirmConcede ? (
        <ConcedeDialog
          opponentName={opponentName}
          isPending={concedeMatch.isPending}
          onCancel={() => setConfirmConcede(false)}
          onConfirm={() => {
            concedeMatch.mutate({ matchId, version: match.version });
            setConfirmConcede(false);
          }}
        />
      ) : null}

      {reportOpen ? (
        <AbuseReportDialog
          targetTeamId={opponentId}
          targetTeamName={opponentName}
          matchId={matchId}
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </section>
  );
}
