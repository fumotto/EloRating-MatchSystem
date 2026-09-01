// Page（05_Frontend.md 3.2）。サブアカウントの疑いを管理者へ提示する（ADR-036 ④）。
//
// ★本画面は判定しない。措置の導線を持たない。BANとクールダウンは通報の画面と
//   チーム管理から行う（ADR-033 ③）。ここに措置ボタンを置くと、機械の疑いが
//   そのまま処分に化ける。
//
// ★対戦の履歴だけを材料にしている。IPアドレスも端末情報も収集していないため、
//   VPN や回線の使い分けはこれらの指標を変えられない（ADR-036 理由）。
import { useSuspiciousPairs, useTeamIntegrity } from "../hooks/useIntegritySignals";
import { EmptyState } from "../../../components/feedback/EmptyState";

const percent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

const minutes = (value: number | null): string => (value === null ? "—" : `${value} 分`);

// UUID をそのまま並べると読めない。チーム名の解決には team_detail_view が要り、
// 本画面の目的（偏りの発見）には過剰であるため、先頭8桁で識別する。
const shortId = (id: string): string => id.slice(0, 8);

export function AdminIntegrityPage() {
  const { data: pairs, isPending: pairsPending } = useSuspiciousPairs();
  const { data: teams, isPending: teamsPending } = useTeamIntegrity();

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">対戦の偏り</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          サブアカウントによるレートの水増しを見つけるための材料です。
          <strong className="font-medium">ここに並ぶのは疑いであって証拠ではありません。</strong>
          仲の良い常連どうしも同じ形になります。措置は通報と同じく、
          複数の材料を突き合わせて判断してください。
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">繰り返し当たっている組み合わせ</h2>
        {pairsPending ? (
          <p className="text-sm text-slate-500">読み込み中…</p>
        ) : !pairs || pairs.length === 0 ? (
          <EmptyState title="2回以上対戦した組み合わせがありません" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">組み合わせ</th>
                  <th className="px-4 py-2 font-medium">試合数</th>
                  <th className="px-4 py-2 font-medium">戦績</th>
                  <th className="px-4 py-2 font-medium">一方向性</th>
                  <th className="px-4 py-2 font-medium">投了</th>
                  <th className="px-4 py-2 font-medium">平均決着</th>
                  <th className="px-4 py-2 font-medium">同時在席</th>
                  <th className="px-4 py-2 font-medium">最終対戦</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pairs.map((pair) => (
                  <tr key={`${pair.teamLowId}|${pair.teamHighId}`}>
                    <td className="px-4 py-2 font-mono text-xs">
                      {shortId(pair.teamLowId)} × {shortId(pair.teamHighId)}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{pair.matchCount}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {pair.lowWins} − {pair.highWins}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{percent(pair.oneSidedRatio)}</td>
                    <td className="px-4 py-2 tabular-nums">{pair.concedeCount}</td>
                    <td className="px-4 py-2 tabular-nums">{minutes(pair.avgSettleMinutes)}</td>
                    <td className="px-4 py-2">
                      {/* 同時在席が一度も無いことは、両チームを同じ人が操作している場合に
                          必ず成立する。ただし片方が新参で他の対戦を持たない場合も成立する。 */}
                      {pair.neverConcurrent ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          重なり無し
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">あり</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(pair.lastCompletedAt).toLocaleString("ja-JP")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          「一方向性」は勝ちが片側へ寄っている度合いです。50% が互角、100%
          は一度も逆向きの結果が出ていないことを表します。「同時在席」が
          <span className="font-medium">重なり無し</span>
          のとき、両チームは同じ時刻に別々の試合へ出たことが一度もありません。
          人はふたつのチームを同時に操作できないため、これは回線を変えても消えません。
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">稼ぎ先が偏っているチーム</h2>
        {teamsPending ? (
          <p className="text-sm text-slate-500">読み込み中…</p>
        ) : !teams || teams.length === 0 ? (
          <EmptyState title="確定した試合がありません" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">チーム</th>
                  <th className="px-4 py-2 font-medium">試合数</th>
                  <th className="px-4 py-2 font-medium">対戦相手</th>
                  <th className="px-4 py-2 font-medium">獲得</th>
                  <th className="px-4 py-2 font-medium">最大の稼ぎ先</th>
                  <th className="px-4 py-2 font-medium">集中</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {teams.map((team) => (
                  <tr key={team.teamId}>
                    <td className="px-4 py-2 font-mono text-xs">{shortId(team.teamId)}</td>
                    <td className="px-4 py-2 tabular-nums">{team.settledMatches}</td>
                    <td className="px-4 py-2 tabular-nums">{team.distinctOpponents}</td>
                    <td className="px-4 py-2 tabular-nums">{team.gainedTotal}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {shortId(team.topOpponentId)}
                      <span className="ml-2 font-sans tabular-nums text-slate-500 dark:text-slate-400">
                        {team.topOpponentMatches} 戦 / {team.topOpponentGained}
                      </span>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{percent(team.topOpponentGainShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          「集中」は獲得したレートのうち、ひとりの相手から得た割合です。対戦相手の数が
          少なく集中が高いチームは、身代わりから稼いでいる可能性があります。
          集計元はシーズンごとに初期化されます。
        </p>
      </div>
    </section>
  );
}
