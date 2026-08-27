// Page（05_Frontend.md 3.2）。シーズンの切り替え（Issue #9）。
//
// ★段階を画面に出す。猶予を挟むため、押した人と確定を見る人が同じとは限らない。
//   いま何段階目で、次に何をすればよいのかを常に示す。
//
// ★取り消せない操作を含む。削除は持ち出しの後にしか押せない（SEASON-005）。
//   画面側でも同じ順序で見せ、押せない理由を書く。
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  useCancelSeasonEnd,
  useEndSeason,
  usePurgeSeasonData,
  useResumeSeason,
  useSeasonState,
} from "../hooks/useSeason";
import { seasonClient } from "../../../services/seasonClient";
import { downloadCsv } from "../../../utils/downloadCsv";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";
import { remainingTime } from "../../../utils/remainingTime";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "通常営業",
  ENDING: "猶予中（進行中の試合を待っています）",
  FINALIZED: "確定済み（持ち出しと削除ができます）",
};

export function AdminSeasonPage() {
  const { data: state, isPending } = useSeasonState();

  const [disbandActive, setDisbandActive] = useState(false);
  const [disbandBanned, setDisbandBanned] = useState(false);
  const [exported, setExported] = useState<Record<string, boolean>>({});

  const endSeason = useEndSeason(disbandActive, disbandBanned);
  const purge = usePurgeSeasonData();
  const resume = useResumeSeason();
  const cancelEnd = useCancelSeasonEnd();

  const exportData = useMutation({
    mutationFn: (kind: "MATCHES" | "LOGS") => seasonClient.exportData({ kind }),
    onSuccess: (result) => {
      const name = result.kind === "MATCHES" ? "matches" : "logs";
      downloadCsv(`season-${result.season}-${name}.csv`, result.rows);
      setExported((prev) => ({ ...prev, [result.kind]: true }));
    },
  });

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;
  if (!state) return <ErrorNotice code="SYSTEM-001" />;

  const failureCode =
    apiErrorCode(endSeason.error) ??
    apiErrorCode(exportData.error) ??
    apiErrorCode(purge.error) ??
    apiErrorCode(resume.error) ??
    apiErrorCode(cancelEnd.error);

  // 確定後は current_season が次の番号になっている。持ち出しの対象は直前である。
  const targetSeason = state.status === "ACTIVE" ? state.currentSeason - 1 : state.currentSeason;
  const canPurge = exported.MATCHES === true && exported.LOGS === true;
  const isFinalized = state.status === "ACTIVE" && state.updatesLocked;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">シーズン</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          現在シーズン {state.currentSeason} ・{" "}
          {isFinalized ? STATUS_LABEL.FINALIZED : STATUS_LABEL[state.status]}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
        <dt className="text-slate-500 dark:text-slate-400">マッチング</dt>
        {/* ★シーズンの停止だけを見て「受付中」と表示してはならない（ADR-038 ③）。
            保守による停止（ADR-034 ⑤）は別の列であり、シーズンを再開しても解除されない。
            片方だけを見ると、再開したのにマッチングが動かない状態を「受付中」と表示する。 */}
        <dd>
          {state.matchmakingPaused || state.maintenancePaused ? "停止中" : "受付中"}
          {state.matchmakingPaused && state.maintenancePaused
            ? "（シーズン・保守）"
            : state.maintenancePaused
              ? "（保守）"
              : state.matchmakingPaused
                ? "（シーズン）"
                : null}
        </dd>
        <dt className="text-slate-500 dark:text-slate-400">利用者の更新操作</dt>
        <dd>{state.updatesLocked ? "禁止中" : "許可"}</dd>
        {state.status === "ENDING" && state.graceUntil ? (
          <>
            <dt className="text-slate-500 dark:text-slate-400">猶予の残り</dt>
            <dd>{remainingTime(state.graceUntil)}</dd>
          </>
        ) : null}
      </dl>

      {/* ---- ① 終了の開始 ---- */}
      {state.status === "ACTIVE" && !state.updatesLocked ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-sm font-medium">① シーズンを終了する</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            マッチングの受付を止め、猶予を開始します。進行中の試合はそのまま続けられます。
            猶予が過ぎると自動で確定します。
          </p>

          {/* ★総解散はここで決める。確定は自動で走るため、後から選ばせられない。 */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={disbandActive}
              onChange={(e) => setDisbandActive(e.target.checked)}
            />
            通常のチームをすべて解散する
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={disbandBanned}
              onChange={(e) => setDisbandBanned(e.target.checked)}
            />
            BAN中のチームをすべて解散する
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            解散はチームごと削除します。実行されるのは戦績データの削除より後です。
          </p>

          <button
            type="button"
            disabled={endSeason.isPending}
            onClick={() => endSeason.mutate()}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {endSeason.isPending ? "実行中…" : "シーズンを終了する"}
          </button>
        </div>
      ) : null}

      {/* ---- ② 猶予中 ---- */}
      {state.status === "ENDING" ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          猶予中です。進行中の試合が決着するのを待っています。猶予を過ぎると、
          残った試合は引き分けとして終了し、確定処理が自動で始まります。この画面を開いたままにする必要はありません。
        </div>
      ) : null}

      {/* ★確定前なら引き返せる。押し間違いに気付いた管理者が、
          確定を待つしかない状態にしない。 */}
      {state.status === "ENDING" ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={cancelEnd.isPending}
            onClick={() => cancelEnd.mutate()}
            className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
          >
            {cancelEnd.isPending ? "処理中…" : "終了を取りやめる"}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            マッチングを再開します。待機列は戻りません。確定後は取りやめられません。
          </p>
        </div>
      ) : null}

      {/* ---- ③ 持ち出しと削除 ---- */}
      {isFinalized ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-sm font-medium">② データを持ち出す（シーズン {targetSeason}）</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            個人を特定できる列は含まれません。削除するには、両方の持ち出しが必要です。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={exportData.isPending}
              onClick={() => exportData.mutate("MATCHES")}
              className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
            >
              戦績データを保存{exported.MATCHES ? "（済）" : ""}
            </button>
            <button
              type="button"
              disabled={exportData.isPending}
              onClick={() => exportData.mutate("LOGS")}
              className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
            >
              ログデータを保存{exported.LOGS ? "（済）" : ""}
            </button>
          </div>

          <h2 className="pt-2 text-sm font-medium">③ データを削除する</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            戦績とログをテーブルから削除します。
            {disbandActive || disbandBanned ? "選択した総解散もここで実行されます。" : null}
            <strong className="text-red-700 dark:text-red-400">この操作は取り消せません。</strong>
          </p>
          {!canPurge ? (
            <p className="text-sm text-amber-700 dark:text-amber-500">
              先に戦績データとログデータの両方を保存してください。
            </p>
          ) : null}
          <button
            type="button"
            disabled={!canPurge || purge.isPending}
            onClick={() => purge.mutate()}
            className="rounded bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {purge.isPending ? "削除中…" : "戦績とログを削除する"}
          </button>

          <h2 className="pt-2 text-sm font-medium">④ 通常営業に戻す</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            利用者の更新操作を解除し、マッチングを再開します。
          </p>
          {/* ★保守停止が残っていると、再開してもマッチングは動かない（ADR-034 ⑤ / ADR-038 ③）。
              押す前に伝える。押した後に「動かない」と気付く形にしてはならない。 */}
          {state.maintenancePaused ? (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-500">
              保守による停止が有効です。このまま戻しても、解除するまでマッチングは成立しません。
              障害が続いているなら意図どおりです。復旧済みなら、システム設定から保守停止も解除してください。
            </p>
          ) : null}
          <button
            type="button"
            disabled={resume.isPending}
            onClick={() => resume.mutate()}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {resume.isPending ? "実行中…" : "通常営業に戻す"}
          </button>
        </div>
      ) : null}

      {purge.data ? (
        <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
          試合 {purge.data.deletedMatches} 件、レート履歴 {purge.data.deletedRatingHistory} 件、
          ログ {purge.data.deletedLogs} 件を削除しました。解散したチームは{" "}
          {purge.data.disbandedTeams} 件です。
        </p>
      ) : null}

      {failureCode ? <ErrorNotice code={failureCode} /> : null}
    </section>
  );
}
