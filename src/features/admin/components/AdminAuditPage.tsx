// Page（05_Frontend.md 3.2）。監査ログの参照。
//
// 追記専用であり、画面から更新・削除する手段は用意しない（ADR-017）。
import { useAuditLogs } from "../hooks/useAuditLogs";
import { EmptyState } from "../../../components/feedback/EmptyState";

export function AdminAuditPage() {
  const { data: logs, isPending } = useAuditLogs();

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;
  if (!logs || logs.length === 0) return <EmptyState title="監査ログがありません" />;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">監査ログ</h1>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
        {logs.map((log) => (
          <li key={log.id} className="px-4 py-2">
            <div className="flex justify-between">
              <span className="font-medium">{log.action}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {new Date(log.createdAt).toLocaleString("ja-JP")}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {log.targetType}
              {log.targetId ? ` / ${log.targetId}` : ""}
              {/* actor が NULL のものはシステム操作である（TC-ADMIN-052）。 */}
              {log.actorProfileId ? ` / 実行者 ${log.actorProfileId}` : " / システム"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
