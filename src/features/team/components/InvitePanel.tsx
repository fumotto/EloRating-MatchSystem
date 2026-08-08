// 招待の発行（05_Frontend.md 14.4）。
//
// ★平文の招待コードは発行時の応答でしか得られない（04 9.3）。再取得はできないため、
//   その場で表示し、利用者に控えてもらう。キャッシュへ保持しない。
import { useCreateInvite } from "../hooks/useCreateInvite";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";

export function InvitePanel({ teamId }: { teamId: string }) {
  const createInvite = useCreateInvite();
  const failureCode = apiErrorCode(createInvite.error);

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">メンバーを招待する</h2>

      <button
        type="button"
        disabled={createInvite.isPending}
        onClick={() => createInvite.mutate({ teamId })}
        className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {createInvite.isPending ? "発行中…" : "招待コードを発行"}
      </button>

      {createInvite.data ? (
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            このコードは再表示できません。発行し直すと以前のコードは無効になります。
          </p>
          <p className="mt-2 break-all font-mono text-sm">{createInvite.data.inviteCode}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            有効期限 {new Date(createInvite.data.expiresAt).toLocaleString("ja-JP")}
          </p>
        </div>
      ) : null}

      {failureCode ? <ErrorNotice code={failureCode} /> : null}
    </div>
  );
}
