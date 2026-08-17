// Page（05_Frontend.md 3.2）。
import { useParams } from "@tanstack/react-router";
import { useTeamDetail } from "../hooks/useTeamDetail";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { Avatar } from "../../../components/media/Avatar";

export function TeamDetailPage() {
  const { teamId } = useParams({ from: "/_app/team/$teamId" });
  const { data: team, isPending } = useTeamDetail(teamId);

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;
  if (!team) return <EmptyState title="チームが見つかりません" />;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{team.teamName}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          レート {team.rating} ・ {team.memberCount}人{team.isBanned ? " ・ BAN中" : ""}
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">メンバー</h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {team.members.map((member) => (
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
    </section>
  );
}
