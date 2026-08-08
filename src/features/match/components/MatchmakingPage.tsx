// Page（05_Frontend.md 3.2）。マッチング待機画面。
import { useRouteContext } from "@tanstack/react-router";
import { useMyTeam } from "../../team/hooks/useMyTeam";
import { useQueueStatus } from "../hooks/useQueueStatus";
import { useQueueMatch } from "../hooks/useQueueMatch";
import { useCancelQueue } from "../hooks/useCancelQueue";
import { useMatchList } from "../hooks/useMatchList";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";

export function MatchmakingPage() {
  const { session } = useRouteContext({ from: "/_app" });
  const { data: team, isPending } = useMyTeam(session?.user.id);
  const { data: queue } = useQueueStatus(team?.id);
  const queueMatch = useQueueMatch();
  const cancelQueue = useCancelQueue();

  // 進行中の試合があれば待機できない（QUEUE-002）。先にそちらを案内する。
  const { data: activeMatches } = useMatchList({ status: ["PLAYING", "WINNER_REPORTED"] });
  const myActiveMatch = activeMatches?.find(
    (m) => m.teamAId === team?.id || m.teamBId === team?.id,
  );

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;

  if (!team) {
    return (
      <EmptyState
        title="チームに所属していません"
        description="マッチングはチーム単位で行います。先にチームを作成または参加してください。"
      />
    );
  }

  const failureCode = apiErrorCode(queueMatch.error) ?? apiErrorCode(cancelQueue.error);

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">マッチング</h1>

      {myActiveMatch ? (
        <EmptyState
          title="進行中の試合があります"
          description="試合が確定するまで新しいマッチングはできません。"
        />
      ) : queue ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <p className="font-medium">対戦相手を探しています…</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              待機開始 {new Date(queue.queuedAt).toLocaleString("ja-JP")}
            </p>
          </div>
          <button
            type="button"
            disabled={cancelQueue.isPending}
            onClick={() => cancelQueue.mutate({ teamId: team.id })}
            className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
          >
            {cancelQueue.isPending ? "処理中…" : "待機をキャンセル"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            マッチングを開始すると、レートの近いチームと自動で対戦が組まれます。
          </p>
          {/* 相手が見つからないのはエラーではない。matched: false で待機が続く（09 4章）。 */}
          <button
            type="button"
            disabled={queueMatch.isPending}
            onClick={() => queueMatch.mutate({ teamId: team.id })}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {queueMatch.isPending ? "登録中…" : "マッチングを開始"}
          </button>
        </div>
      )}

      {queueMatch.data && !queueMatch.data.matched ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          今は相手が見つかりませんでした。このまま待機します。
        </p>
      ) : null}

      {failureCode ? <ErrorNotice code={failureCode} /> : null}
    </section>
  );
}
