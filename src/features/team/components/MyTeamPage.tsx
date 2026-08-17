// Page（05_Frontend.md 3.2）。画面構成のみ。データ取得は Feature Hook が行う。
import { Link, useRouteContext } from "@tanstack/react-router";
import { useMyTeam } from "../hooks/useMyTeam";
import { useTeamDetail } from "../hooks/useTeamDetail";
import { useLeaveTeam } from "../hooks/useLeaveTeam";
import { useTransferLeader } from "../hooks/useTransferLeader";
import { InvitePanel } from "./InvitePanel";
import { Avatar } from "../../../components/media/Avatar";
import { AcceptInviteForm } from "./AcceptInviteForm";
import { CreateTeamDialog } from "./CreateTeamDialog";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";

export function MyTeamPage() {
  const { session } = useRouteContext({ from: "/_app" });
  const profileId = session?.user.id;

  const { data: team, isPending } = useMyTeam(profileId);
  const { data: detail } = useTeamDetail(team?.id);
  const leaveTeam = useLeaveTeam();
  const transferLeader = useTransferLeader();

  if (isPending) {
    return <p className="text-sm text-slate-500">読み込み中…</p>;
  }

  // 未所属なら、作成と招待参加の両方の導線を出す。参加は招待制のみである（ADR-013）。
  if (!team) {
    return (
      <section className="space-y-6">
        <h1 className="text-xl font-semibold">マイチーム</h1>
        <EmptyState
          title="まだチームに所属していません"
          description="チームを作成するか、招待コードで参加してください。"
        />
        <CreateTeamDialog />
        <AcceptInviteForm />
      </section>
    );
  }

  const isLeader = detail?.leaderId === profileId;

  // BAN中は編成を変えられない（04_BackendInterface.md 12.1）。
  // ★判定の正本はバックエンドである。ここでの出し分けは、押せば必ず失敗する
  //   操作を活かしておかないための案内にすぎない。
  const isBanned = detail?.isBanned === true;
  const others = detail?.members.filter((m) => m.id !== profileId) ?? [];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{team.name}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          レート {team.rating}
          {detail ? ` ・ ${detail.memberCount}人` : null}
          {detail?.isBanned ? " ・ BAN中" : null}
        </p>
        <Link
          to="/team/$teamId"
          params={{ teamId: team.id }}
          className="mt-1 inline-block text-sm text-indigo-600 dark:text-indigo-400"
        >
          チーム詳細を見る
        </Link>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">メンバー</h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {detail?.members.map((member) => (
            <li key={member.id} className="flex items-center justify-between px-4 py-2">
              <span className="flex items-center gap-2 text-sm">
                <Avatar src={member.avatarUrl} name={member.displayName} />
                {member.displayName}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {member.role === "LEADER" ? "リーダー" : "メンバー"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {isBanned ? (
        <div
          role="status"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          このチームはBANされています。解除されるまで、メンバーの追加・脱退・リーダーの移譲・
          マッチングはできません。心当たりが無い場合は運営へお問い合わせください。
        </div>
      ) : null}

      {/* 招待発行はリーダーのみ（04 9.3）。画面側の出し分けは利便性のためである。 */}
      {isLeader && !isBanned ? <InvitePanel teamId={team.id} /> : null}

      {isLeader && !isBanned && others.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">リーダーの移譲</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((member) => (
              <button
                key={member.id}
                type="button"
                disabled={transferLeader.isPending}
                onClick={() => transferLeader.mutate({ newLeaderProfileId: member.id })}
                className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700"
              >
                {member.displayName} へ移譲
              </button>
            ))}
          </div>
          <ErrorNoticeIfAny error={transferLeader.error} />
        </div>
      ) : null}

      <div className="space-y-2">
        {/* 単独リーダーは脱退できる。他メンバーが居る場合は TEAM-008 が返る（04 9.5）。 */}
        <button
          type="button"
          disabled={leaveTeam.isPending || isBanned}
          onClick={() => leaveTeam.mutate()}
          className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
        >
          {leaveTeam.isPending ? "処理中…" : "チームを脱退する"}
        </button>
        <ErrorNoticeIfAny error={leaveTeam.error} />
      </div>
    </section>
  );
}

function ErrorNoticeIfAny({ error }: { error: unknown }) {
  const code = apiErrorCode(error);
  return code ? <ErrorNotice code={code} /> : null;
}
