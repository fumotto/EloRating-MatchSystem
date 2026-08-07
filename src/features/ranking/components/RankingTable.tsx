// Feature固有のUI（05_Frontend.md 4.1）。
// ★Component は API 呼び出し・業務ロジックを持たない（3.2）。データは props で受け取る。
import type { RankingEntry } from "../../../types/api";
import { EmptyState } from "../../../components/feedback/EmptyState";

interface RankingTableProps {
  entries: RankingEntry[];
}

function formatWinRate(winRate: number | null): string {
  if (winRate === null) return "—";
  return `${Math.round(winRate * 100)}%`;
}

export function RankingTable({ entries }: RankingTableProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="まだチームがありません"
        description="チームが作成されるとここに表示されます。"
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left dark:border-slate-800">
          <tr>
            <th scope="col" className="py-2 pr-4">
              順位
            </th>
            <th scope="col" className="py-2 pr-4">
              チーム
            </th>
            <th scope="col" className="py-2 pr-4 text-right">
              レート
            </th>
            <th scope="col" className="py-2 pr-4 text-right">
              勝
            </th>
            <th scope="col" className="py-2 pr-4 text-right">
              敗
            </th>
            <th scope="col" className="py-2 text-right">
              勝率
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.teamId} className="border-b border-slate-100 dark:border-slate-900">
              <td className="py-2 pr-4 tabular-nums">{entry.rank}</td>
              <td className="py-2 pr-4">{entry.teamName}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{entry.rating}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{entry.wins}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{entry.losses}</td>
              <td className="py-2 text-right tabular-nums">{formatWinRate(entry.winRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
