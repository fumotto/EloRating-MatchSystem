// Page（05_Frontend.md 3.2）。
//
// ★Profile に管理者情報は含めない。判定はJWTの app_metadata.role で行う（5.3・ADR-020）。
import { useRouteContext } from "@tanstack/react-router";
import { useMyTeam } from "../../team/hooks/useMyTeam";
import { providerDisplayName } from "../../auth/authProvider";
import { Avatar } from "../../../components/media/Avatar";

export function ProfilePage() {
  const { session } = useRouteContext({ from: "/_app" });
  const { data: team } = useMyTeam(session?.user.id);

  const displayName = session?.user.user_metadata?.full_name ?? "—";

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">プロフィール</h1>
      <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-slate-500 dark:text-slate-400">表示名</dt>
          <dd className="flex items-center gap-2">
            <Avatar src={session?.user.user_metadata?.avatar_url} name={displayName} />
            {displayName}
          </dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500 dark:text-slate-400">認証プロバイダ</dt>
          <dd>{providerDisplayName(session?.user.app_metadata?.provider)}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500 dark:text-slate-400">所属チーム</dt>
          <dd>{team ? team.name : "未所属"}</dd>
        </div>
      </dl>
    </section>
  );
}
