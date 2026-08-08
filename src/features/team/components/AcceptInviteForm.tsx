// 招待コードによる参加（05_Frontend.md 14.4）。
import { useState } from "react";
import { useAcceptInvite } from "../hooks/useAcceptInvite";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";

export function AcceptInviteForm() {
  const [inviteCode, setInviteCode] = useState("");
  const acceptInvite = useAcceptInvite();
  const failureCode = apiErrorCode(acceptInvite.error);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        acceptInvite.mutate({ inviteCode: inviteCode.trim() });
      }}
    >
      <div>
        <label htmlFor="invite-code" className="block text-sm font-medium">
          招待コード
        </label>
        <input
          id="invite-code"
          type="text"
          autoComplete="off"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      {failureCode ? <ErrorNotice code={failureCode} /> : null}

      <button
        type="submit"
        disabled={acceptInvite.isPending || inviteCode.trim().length === 0}
        className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {acceptInvite.isPending ? "参加中…" : "チームに参加"}
      </button>
    </form>
  );
}
