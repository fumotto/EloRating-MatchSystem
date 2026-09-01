// Page（05_Frontend.md 3.2）。管理者による対戦カードの作成（ADR-035 ⑤ / ADR-039）。
//
// ★自動マッチングの代わりではない。大会・イベントで、当たるべき相手を運営が指定する画面である。
//   レート差・再マッチ抑止・クールダウンには拘束されない。
//
// ★必須人数を要求しないため、人数は画面が唯一の手がかりである（ADR-039 ④）。
//   不揃いでも組めるが、組む前に見えるようにする。
//
// ★作成は取り消せない。用意した試合は相手チームを報告期限まで拘束する。
//   投了・申告・不成立の申請という通常の手段でしか終わらない（ADR-035 ⑤）。
//   押し間違いの防御は確認だけであり、省略可能にしてはならない（ADR-032 ① と同じ考え）。
import { useState } from "react";
import { useAdminCreateMatch, useMatchCandidates } from "../hooks/useAdminActions";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";
import type { MatchCandidateTeam } from "../../../types/api";

const label = (team: MatchCandidateTeam) =>
  `${team.teamName}（レート ${team.rating} / ${team.memberCount}人）`;

export function AdminMatchesPage() {
  const { data: candidates, isPending } = useMatchCandidates();
  const createMatch = useAdminCreateMatch();
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [confirming, setConfirming] = useState(false);

  // BANチームは対戦できない（バックエンドも TEAM-006 で弾く）。選ばせない。
  // メンバーが0人のチームも同様に組めない（TEAM-011）。誰も結果を報告できないためである。
  const selectable = (candidates ?? []).filter((t) => !t.isBanned && t.memberCount > 0);

  const teamA = selectable.find((t) => t.teamId === teamAId);
  const teamB = selectable.find((t) => t.teamId === teamBId);
  const ready = teamA !== undefined && teamB !== undefined && teamAId !== teamBId;

  const confirm = () => {
    if (!ready) return;
    createMatch.mutate(
      { teamAId, teamBId },
      {
        onSuccess: () => {
          setConfirming(false);
          setTeamAId("");
          setTeamBId("");
        },
      },
    );
  };

  const failureCode = apiErrorCode(createMatch.error);

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">対戦カードを用意する</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          大会やイベントのために、対戦する2チームを直接指定します。
          <strong className="font-medium">
            レート差・再戦の抑止・クールダウンは適用されません。
          </strong>
          待機列を経由しないため、進行中の試合を持つチームにも重ねて割り当てられます。
        </p>
      </div>

      {selectable.length < 2 ? (
        <EmptyState
          title="組めるチームが足りません"
          description="BANされていない、メンバーが1人以上のチームが2つ必要です。"
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="teamA" className="block text-sm">
                チーム A
              </label>
              <select
                id="teamA"
                value={teamAId}
                onChange={(e) => setTeamAId(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">選択してください</option>
                {selectable.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {label(team)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="teamB" className="block text-sm">
                チーム B
              </label>
              <select
                id="teamB"
                value={teamBId}
                onChange={(e) => setTeamBId(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">選択してください</option>
                {selectable
                  .filter((team) => team.teamId !== teamAId)
                  .map((team) => (
                    <option key={team.teamId} value={team.teamId}>
                      {label(team)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* ★人数が揃っていない組み合わせは止めないが、必ず知らせる（ADR-039 ④）。 */}
          {teamA && teamB && teamA.memberCount !== teamB.memberCount ? (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-500">
              人数が揃っていません（{teamA.teamName} {teamA.memberCount}人 / {teamB.teamName}{" "}
              {teamB.memberCount}人）。このまま組むこともできます。
            </p>
          ) : null}

          {confirming && teamA && teamB ? (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <p className="text-sm">
                <strong className="font-medium">
                  {teamA.teamName} 対 {teamB.teamName}
                </strong>{" "}
                の試合を用意します。
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <strong className="font-medium">取り消せません。</strong>
                用意した試合は、投了・勝利申告・不成立の申請のいずれかでしか終わりません。
                それまで両チームは新しいマッチングを始められません。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={createMatch.isPending}
                  onClick={confirm}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {createMatch.isPending ? "作成中…" : "この組み合わせで用意する"}
                </button>
                <button
                  type="button"
                  disabled={createMatch.isPending}
                  onClick={() => setConfirming(false)}
                  className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
                >
                  やめる
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!ready}
              onClick={() => setConfirming(true)}
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              内容を確認する
            </button>
          )}
        </div>
      )}

      {createMatch.data ? (
        <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
          試合を用意しました。申告期限は{" "}
          {new Date(createMatch.data.reportDeadlineAt).toLocaleString("ja-JP")} です。
        </p>
      ) : null}

      {failureCode ? <ErrorNotice code={failureCode} /> : null}
    </section>
  );
}
