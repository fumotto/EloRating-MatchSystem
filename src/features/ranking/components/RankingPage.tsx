// Page（05_Frontend.md 3.2）。画面構成のみを担い、データ取得は Feature Hook に委ねる。
import { useRanking } from "../hooks/useRanking";
import { RankingTable } from "./RankingTable";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";

export function RankingPage() {
  const { data, isPending, isError } = useRanking();

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">ランキング</h1>
      {isPending ? <p className="text-sm text-slate-500">読み込み中…</p> : null}
      {isError ? <ErrorNotice code="SYSTEM-001" /> : null}
      {data ? <RankingTable entries={data} /> : null}
    </section>
  );
}
