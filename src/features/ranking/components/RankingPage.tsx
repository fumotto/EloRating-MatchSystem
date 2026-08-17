// Page（05_Frontend.md 3.2）。画面構成のみを担い、データ取得は Feature Hook に委ねる。
import { useRouteContext } from "@tanstack/react-router";
import { useRanking } from "../hooks/useRanking";
import { RankingTable } from "./RankingTable";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";

export function RankingPage() {
  const { data, isPending, isError } = useRanking();
  // ★レイアウトが持つセッションを使う。ここで useSession を呼ぶと購読が二重になる。
  const { session } = useRouteContext({ from: "/_public" });

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">ランキング</h1>
      {isPending ? <p className="text-sm text-slate-500">読み込み中…</p> : null}
      {isError ? <ErrorNotice code="SYSTEM-001" /> : null}
      {session ? (
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          チーム名を選ぶと、そのチームのメンバーを確認できます。
        </p>
      ) : null}
      {data ? <RankingTable entries={data} linkTeams={Boolean(session)} /> : null}
    </section>
  );
}
