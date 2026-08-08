// Page（05_Frontend.md 3.2）。
import { Link } from "@tanstack/react-router";
import { useMatchList } from "../hooks/useMatchList";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { matchStatusLabel } from "./matchStatusLabel";

export function MatchListPage() {
  const { data: matches, isPending } = useMatchList();

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;
  if (!matches || matches.length === 0) {
    return (
      <EmptyState title="試合がありません" description="マッチングを開始すると表示されます。" />
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">試合一覧</h1>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {matches.map((match) => (
          <li key={match.id}>
            <Link
              to="/matches/$matchId"
              params={{ matchId: match.id }}
              className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              <span className="text-sm">
                {match.teamAName} vs {match.teamBName}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {matchStatusLabel(match.status)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
