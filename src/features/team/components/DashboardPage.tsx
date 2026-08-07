// Page（05_Frontend.md 3.2）。画面構成のみ。データ取得は Feature Hook が行う。
import { useRouteContext } from "@tanstack/react-router";
import { useMyTeam } from "../hooks/useMyTeam";
import { CreateTeamDialog } from "./CreateTeamDialog";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { providerDisplayName } from "../../auth/authProvider";

export function DashboardPage() {
  const { session } = useRouteContext({ from: "/_app" });
  const { data: team, isPending } = useMyTeam(session?.user.id);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">ダッシュボード</h1>
        {/* 表示するプロバイダ名は authProvider から取得する（7章・ADR-015）。 */}
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {providerDisplayName(session?.user.app_metadata?.provider)} でログイン中
        </p>
      </div>

      {isPending ? <p className="text-sm text-slate-500">読み込み中…</p> : null}

      {!isPending && team ? (
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <p className="font-medium">{team.name}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">レート {team.rating}</p>
        </div>
      ) : null}

      {!isPending && !team ? (
        <div className="space-y-4">
          <EmptyState
            title="まだチームに所属していません"
            description="チームを作成すると、ランキングに反映されます。"
          />
          <CreateTeamDialog />
        </div>
      ) : null}
    </section>
  );
}
