// Page（05_Frontend.md 3.2）。マッチング待機画面。
import { useRouteContext } from "@tanstack/react-router";
import { useMyTeam } from "../../team/hooks/useMyTeam";
import { useTeamDetail } from "../../team/hooks/useTeamDetail";
import { useSystemSettings } from "../../settings/hooks/useSystemSettings";
import { useQueueStatus } from "../hooks/useQueueStatus";
import { useQueueMatch } from "../hooks/useQueueMatch";
import { useCancelQueue } from "../hooks/useCancelQueue";
import { useMatchList } from "../hooks/useMatchList";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";
import { requestNotificationPermission } from "../../../utils/browserNotification";
import { useSeasonState } from "../../season/hooks/useSeason";

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

  // 必須人数に満たなければ待機できない（QUEUE-005 / 09 4.1）。必須人数は上限と等しい。
  // ★判定の正本はバックエンドである。ここでの表示は、押せば必ず失敗するボタンを
  //   活かしておかないための案内にすぎない。人数はいつでも変わりうるため、
  //   画面が通したからといって成功は保証されない。
  const { data: teamDetail } = useTeamDetail(team?.id);
  const { data: settings } = useSystemSettings();
  const requiredMembers = settings?.team_max_members;
  const memberCount = teamDetail?.memberCount;

  // ★人数と必須人数が揃うまでは「不足していない」と見なしてはならない。
  //   未確定のうちにボタンを活かすと、一瞬押せる状態が見えてから非活性へ変わる。
  const isRosterLoading = memberCount === undefined || requiredMembers === undefined;

  // 不足しているときだけ値を持つ。真偽値にすると表示側で null 判定が失われる。
  const shortfall =
    !isRosterLoading && memberCount < requiredMembers
      ? { current: memberCount, required: requiredMembers }
      : null;

  // シーズン切替中はマッチングを受け付けない（Issue #9 / SEASON-002）。
  // ★押してからエラーにしない。停止していることと、その理由を先に見せる。
  const { data: seasonState } = useSeasonState();
  const isPaused = seasonState?.matchmakingPaused === true;

  const canQueue = !isRosterLoading && shortfall === null && !isPaused;

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

          {/* ★停止中はその旨を先に出す。不具合と区別できるようにする。 */}
          {isPaused ? (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-500">
              シーズンの切り替え中のため、マッチングを一時停止しています。
              再開までお待ちください。進行中の試合はそのまま続けられます。
            </p>
          ) : null}

          {/* ★不足の案内とボタンは同時に出す。ボタンを消して入れ替えると、
              人数が確定するまでの間だけボタンが見え、直後に消える形になる。 */}
          {shortfall ? (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-500">
              チーム人数が足りません。マッチングには{shortfall.required}人必要です（現在{" "}
              {shortfall.current}人）。メンバーを招待してください。
            </p>
          ) : null}

          {/* 相手が見つからないのはエラーではない。matched: false で待機が続く（09 4章）。 */}
          <button
            type="button"
            disabled={!canQueue || queueMatch.isPending}
            onClick={() => {
              // ★通知の許可はここで求める。利用者の操作が起点であり、
              //   相手を待つ場面なので通知が要る理由も伝わる。
              //   読み込み直後に求めると多くのブラウザが拒否扱いにする。
              void requestNotificationPermission();
              queueMatch.mutate({ teamId: team.id });
            }}
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
