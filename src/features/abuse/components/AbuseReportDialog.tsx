// 通報フォーム（05_Frontend.md 14.9 / ADR-033）。
//
// ★証拠URLを必須にしない。録画やスクリーンショットを残していない利用者が通報できなく
//   なり、累積による判断（ADR-033 ④）の材料も集まらない。
// ★送信後に「調査します」「対応します」と書かない。単発の通報では措置しないためである。
import { useState } from "react";
import { useCreateAbuseReport } from "../hooks/useAbuseReports";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";
import type { AbuseReasonCode } from "../../../types/api";

const REASONS: { code: AbuseReasonCode; label: string }[] = [
  { code: "FALSE_REPORT", label: "虚偽の勝敗申告" },
  { code: "NO_SHOW", label: "試合に現れない・応答しない" },
  { code: "HARASSMENT", label: "暴言・迷惑行為" },
  { code: "CHEATING", label: "ゲーム内での不正行為" },
  { code: "OTHER", label: "その他" },
];

const DETAIL_MIN = 10;
const DETAIL_MAX = 1000;

interface Props {
  targetTeamId: string;
  targetTeamName: string;
  matchId?: string;
  onClose: () => void;
}

export function AbuseReportDialog({ targetTeamId, targetTeamName, matchId, onClose }: Props) {
  const [reasonCode, setReasonCode] = useState<AbuseReasonCode>("FALSE_REPORT");
  const [detail, setDetail] = useState("");
  const [urls, setUrls] = useState(["", "", ""]);
  const createReport = useCreateAbuseReport();

  const tooShort = detail.trim().length < DETAIL_MIN;

  if (createReport.isSuccess) {
    return (
      <Shell onClose={onClose} title="通報を受け付けました">
        {/* ★「調査します」「対応します」と書かない。単発では措置しない（ADR-033 ④）。 */}
        <p className="text-sm">受け付けました。内容は運営が確認します。</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          確定した試合の結果は変わりません。措置は複数のチームからの通報が積み重なったときに
          運営が判断します。
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white"
          >
            閉じる
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose} title={`${targetTeamName} を通報する`}>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        通報しても試合は止まりません。<strong>確定した結果も変わりません。</strong>
        繰り返す相手を運営が把握するための機能です。
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">理由</legend>
        <div className="mt-2 space-y-1">
          {REASONS.map((r) => (
            <label key={r.code} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="reason"
                value={r.code}
                checked={reasonCode === r.code}
                onChange={() => setReasonCode(r.code)}
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor="abuse-detail" className="text-sm font-medium">
          何があったか
        </label>
        <textarea
          id="abuse-detail"
          value={detail}
          maxLength={DETAIL_MAX}
          rows={4}
          onChange={(e) => setDetail(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {tooShort
            ? `あと ${DETAIL_MIN - detail.trim().length} 文字以上`
            : `残り ${DETAIL_MAX - detail.length} 文字`}
        </p>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium">証拠URL（任意）</p>
        {/* ★必須にしない。証拠が無くても通報できることを明示する。 */}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          <strong>証拠が無くても通報できます。</strong>
          スクリーンショットや Discord のメッセージリンクがあれば貼ってください。
        </p>
        {urls.map((u, i) => (
          <input
            key={i}
            type="url"
            value={u}
            placeholder="https://"
            onChange={(e) => setUrls(urls.map((v, j) => (j === i ? e.target.value : v)))}
            className="mt-2 w-full rounded border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        ))}
      </div>

      {createReport.error ? <ErrorNotice code={apiErrorCode(createReport.error)} /> : null}

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
        >
          やめる
        </button>
        <button
          type="button"
          disabled={tooShort || createReport.isPending}
          onClick={() =>
            createReport.mutate({
              targetTeamId,
              reasonCode,
              detail: detail.trim(),
              ...(matchId ? { matchId } : {}),
              evidenceUrls: urls.map((u) => u.trim()).filter((u) => u.length > 0),
            })
          }
          className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {createReport.isPending ? "送信中…" : "通報する"}
        </button>
      </div>
    </Shell>
  );
}

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="abuse-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4"
    >
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-lg dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <h2 id="abuse-title" className="text-base font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="text-slate-400">
            ×
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
