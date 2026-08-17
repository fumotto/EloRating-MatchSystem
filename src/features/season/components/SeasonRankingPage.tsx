// Page（05_Frontend.md 3.2）。シーズン別ランキング（Issue #9）。
//
// ★未認証にも見せる。現行ランキングと同じ扱いである（ADR-018）。
//
// ★退避した名前を出す。チームは総解散で消えることがあり、teams を引くと
//   過去のランキングが表示できなくなる。
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSeasonList, useSeasonMembers, useSeasonRanking } from "../hooks/useSeason";
import { EmptyState } from "../../../components/feedback/EmptyState";

function formatWinRate(winRate: number | null): string {
  if (winRate === null) return "—";
  return `${Math.round(winRate * 100)}%`;
}

export function SeasonRankingPage() {
  const { data: seasons, isPending } = useSeasonList();
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [openTeam, setOpenTeam] = useState<string | undefined>(undefined);

  const season = selected ?? seasons?.[0]?.number;
  const { data: entries } = useSeasonRanking(season);
  const { data: members } = useSeasonMembers(season, openTeam);

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;

  if (!seasons || seasons.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">過去のシーズン</h1>
        <EmptyState
          title="まだ終了したシーズンがありません"
          description="シーズンが終わると、その時点のランキングがここに残ります。"
        />
        <Link to="/ranking" className="text-sm text-indigo-600 dark:text-indigo-400">
          現在のランキングを見る
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">過去のシーズン</h1>

      <label className="block text-sm">
        シーズン
        <select
          value={season}
          onChange={(e) => {
            setSelected(Number(e.target.value));
            setOpenTeam(undefined);
          }}
          className="ml-2 rounded border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
        >
          {seasons.map((s) => (
            <option key={s.number} value={s.number}>
              シーズン {s.number}
              {s.endedAt ? `（${new Date(s.endedAt).toLocaleDateString("ja-JP")} 終了）` : ""}
            </option>
          ))}
        </select>
      </label>

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
            {(entries ?? []).map((entry) => (
              <tr key={entry.teamId} className="border-b border-slate-100 dark:border-slate-900">
                <td className="py-2 pr-4 tabular-nums">{entry.rank}</td>
                <td className="py-2 pr-4">
                  {/* ★チーム詳細へは飛ばさない。当時のチームは消えている場合がある。
                      退避したメンバーをその場で開く。 */}
                  <button
                    type="button"
                    onClick={() =>
                      setOpenTeam((prev) => (prev === entry.teamId ? undefined : entry.teamId))
                    }
                    className="text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {entry.teamName}
                  </button>
                  {entry.isBanned ? (
                    <span className="ml-2 text-xs text-red-700 dark:text-red-400">BAN</span>
                  ) : null}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{entry.rating}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{entry.wins}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{entry.losses}</td>
                <td className="py-2 text-right tabular-nums">{formatWinRate(entry.winRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openTeam ? (
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <h2 className="mb-2 text-sm font-medium">当時のメンバー</h2>
          {members === undefined ? (
            <p className="text-sm text-slate-500">読み込み中…</p>
          ) : members.length === 0 ? (
            // ★未認証には見えない（season_member_view は認証済み限定）。
            <p className="text-sm text-slate-500 dark:text-slate-400">
              メンバーの表示にはログインが必要です。
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
              {members.map((m) => (
                <li key={m.profileId} className="flex justify-between py-2">
                  <span>{m.displayName}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {m.role === "LEADER" ? "リーダー" : "メンバー"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
