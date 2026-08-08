// Page（05_Frontend.md 3.2）。チームのBAN・解除。
//
// BAN・解除は冪等である。既に同じ状態でも成功を返す（06_ErrorCode.md 15章）。
import { useState } from "react";
import { useRanking } from "../../ranking/hooks/useRanking";
import { useAdminBanTeam, useAdminUnbanTeam } from "../hooks/useAdminActions";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";

export function AdminTeamsPage() {
  const { data: teams, isPending } = useRanking();
  const [reason, setReason] = useState("");
  const banTeam = useAdminBanTeam();
  const unbanTeam = useAdminUnbanTeam();

  const failureCode = apiErrorCode(banTeam.error) ?? apiErrorCode(unbanTeam.error);

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">チーム管理</h1>

      <div>
        <label htmlFor="ban-reason" className="block text-sm font-medium">
          BANの理由（1〜500文字・監査ログへ記録されます）
        </label>
        <input
          id="ban-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      {failureCode ? <ErrorNotice code={failureCode} /> : null}

      {isPending ? <p className="text-sm text-slate-500">読み込み中…</p> : null}

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {teams?.map((team) => (
          <li key={team.teamId} className="flex items-center justify-between px-4 py-2">
            <span className="text-sm">
              {team.teamName}
              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                レート {team.rating}
              </span>
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={banTeam.isPending || reason.trim().length === 0}
                onClick={() => banTeam.mutate({ teamId: team.teamId, reason: reason.trim() })}
                className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
              >
                BAN
              </button>
              <button
                type="button"
                disabled={unbanTeam.isPending}
                onClick={() => unbanTeam.mutate({ teamId: team.teamId })}
                className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-slate-700"
              >
                解除
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
