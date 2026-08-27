// 管理画面：通報（05_Frontend.md 14.10 / ADR-033）。
//
// ★単発の通報で措置しない。判断は「異なるチームからの累積」に基づく（ADR-033 ④）。
//   画面では通報元チーム数（m）を通報件数（n）より先に置く。並び順が判断を誘導する。
// ★「結果を訂正する」導線を置かない。確定した試合は覆らない（ADR-033 ①）。
//   存在しない操作を画面に示唆してはならない。
import { useState } from "react";
import {
  useAbuseAggregates,
  useAbuseReports,
  useResolveAbuseReport,
} from "../hooks/useAbuseReports";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";
import type { AbuseReasonCode } from "../../../types/api";

const REASON_LABELS: Record<AbuseReasonCode, string> = {
  FALSE_REPORT: "虚偽の勝敗申告",
  NO_SHOW: "無応答",
  HARASSMENT: "迷惑行為",
  CHEATING: "ゲーム内不正",
  OTHER: "その他",
};

const COOLDOWN_MINUTES = 60;

export function AdminAbuseReportsPage() {
  const { data: reports, isPending } = useAbuseReports(true);
  const { data: aggregates } = useAbuseAggregates();
  const resolve = useResolveAbuseReport();
  const [note, setNote] = useState<Record<string, string>>({});

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">通報</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          <strong>1件の通報では措置しないでください。</strong>
          違うチームからの通報が積み重なったときに判断します。
          確定した試合の結果は、どの措置でも変わりません。
        </p>
      </div>

      <div>
        <h2 className="text-sm font-medium">チームごとの累積</h2>
        {aggregates && aggregates.length > 0 ? (
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-1">対象チーム</th>
                {/* ★m を先に置く。n は1チームから何度でも増やせる。 */}
                <th className="py-1">通報元チーム数</th>
                <th className="py-1">通報件数</th>
                <th className="py-1">措置</th>
              </tr>
            </thead>
            <tbody>
              {aggregates.map((a) => (
                <tr
                  key={a.targetTeamId}
                  className="border-t border-slate-200 dark:border-slate-800"
                >
                  <td className="py-1 font-mono text-xs">{a.targetTeamId}</td>
                  <td className="py-1 font-semibold">{a.reporterTeamCount}</td>
                  <td className="py-1 text-slate-500">{a.reportCount}</td>
                  <td className="py-1">{a.sanctionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-slate-500">まだ累積はありません。</p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium">未処理の通報</h2>
        {!reports || reports.length === 0 ? (
          <EmptyState title="未処理の通報はありません" />
        ) : (
          <ul className="mt-2 space-y-4">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800"
              >
                <p className="font-medium">{REASON_LABELS[r.reasonCode]}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  対象 {r.targetTeamId} ／ 通報元 {r.reporterTeamId ?? "（無所属）"}
                  {r.matchId ? ` ／ 試合 ${r.matchId}` : ""}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{r.detail}</p>

                {r.evidenceUrls.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">証拠</p>
                    {/* ★自動リンクしない。任意の外部URLが入りうるため、
                            文字列として見せ、明示の操作で開かせる。 */}
                    {r.evidenceUrls.map((u) => (
                      <div key={u} className="mt-1 flex items-center gap-2">
                        <code className="break-all text-xs">{u}</code>
                        <a
                          href={u}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-xs underline"
                        >
                          開く
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    証拠なし（提出は任意です）
                  </p>
                )}

                <input
                  type="text"
                  value={note[r.id] ?? ""}
                  placeholder="記録（任意）"
                  onChange={(e) => setNote({ ...note, [r.id]: e.target.value })}
                  className="mt-3 w-full rounded border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    [
                      ["NO_ACTION", "措置なし"],
                      ["WARNED", "警告した"],
                      ["COOLDOWN", `待機 ${COOLDOWN_MINUTES}分`],
                      ["BANNED", "BAN"],
                    ] as const
                  ).map(([resolution, label]) => (
                    <button
                      key={resolution}
                      type="button"
                      disabled={resolve.isPending}
                      onClick={() =>
                        resolve.mutate({
                          reportId: r.id,
                          resolution,
                          ...(note[r.id] ? { note: note[r.id] } : {}),
                          ...(resolution === "COOLDOWN"
                            ? { cooldownMinutes: COOLDOWN_MINUTES }
                            : {}),
                        })
                      }
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-slate-700"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  警告はシステム上の効果を持ちません。伝達は Discord で行ってください。
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {resolve.error ? <ErrorNotice code={apiErrorCode(resolve.error)} /> : null}
    </section>
  );
}
