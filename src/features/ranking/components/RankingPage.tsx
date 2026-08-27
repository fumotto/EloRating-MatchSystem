// Page（05_Frontend.md 3.2）。画面構成のみを担い、データ取得は Feature Hook に委ねる。
import { useRouteContext } from "@tanstack/react-router";
import { useRanking } from "../hooks/useRanking";
import { useSystemSettings } from "../../settings/hooks/useSystemSettings";
import { RankingTable } from "./RankingTable";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";

export function RankingPage() {
  const { data, isPending, isError } = useRanking();
  // ★レイアウトが持つセッションを使う。ここで useSession を呼ぶと購読が二重になる。
  const { session } = useRouteContext({ from: "/_public" });
  // 掲載条件の案内（ADR-036 ③）。
  // ★system_settings は認証済みでないと読めない（0013_rls.sql）。未認証には出さない。
  //   一覧から消えたチームの側に理由を伝えることが目的であり、閲覧者には要らない。
  const { data: settings } = useSystemSettings({ enabled: Boolean(session) });
  const minOpponents = settings?.ranking_min_opponents ?? 0;

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
      {session && minOpponents > 0 ? (
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          ランキングへの掲載には、異なる {minOpponents}{" "}
          チーム以上との対戦が必要です。条件を満たすまで、レートは記録されますが一覧には出ません。
        </p>
      ) : null}
      {data ? <RankingTable entries={data} linkTeams={Boolean(session)} /> : null}
    </section>
  );
}
