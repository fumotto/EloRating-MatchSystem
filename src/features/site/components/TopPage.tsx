// Page（05_Frontend.md 3.2）。トップページ（Issue #8）。
//
// ★未ログインで表示する。設定は public_settings ビューから取る（Migration 0018）。
import { Link, useRouteContext } from "@tanstack/react-router";
import { usePublicSettings } from "../../settings/hooks/usePublicSettings";

export function TopPage() {
  const { session } = useRouteContext({ from: "/_public" });
  const { data: settings } = usePublicSettings();

  const title = settings?.site_title ?? "EloRating-MatchSystem";

  // ★背景は public/ 配下の相対パスである。BASE_URL を前置してサブパス配信に追随させる。
  //   値の検証（絶対URL・遡上の禁止）はDBとEdge Functionが済ませている（Migration 0018）。
  const background = settings?.background_image_path
    ? `${import.meta.env.BASE_URL}${settings.background_image_path}`
    : null;

  return (
    <section className="relative isolate overflow-hidden rounded-lg">
      {background ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: `url("${background}")` }}
          />
          {/* 背景画像の明暗にかかわらず文字を読めるようにする。 */}
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-black/55" />
        </>
      ) : null}

      <div
        className={`flex flex-col items-center gap-6 px-6 py-20 text-center ${
          background ? "text-white" : ""
        }`}
      >
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
        <p
          className={`max-w-md text-sm ${background ? "text-white/80" : "text-slate-500 dark:text-slate-400"}`}
        >
          チームを組んで対戦し、勝敗に応じてレートが上下します。
          実力の近いチーム同士が自動で組まれます。
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* ログイン済みならダッシュボードへ直接入れる。再ログインを促さない。 */}
          {session ? (
            <Link
              to="/dashboard"
              className="rounded bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white"
            >
              ダッシュボードへ
            </Link>
          ) : (
            <Link
              to="/login"
              className="rounded bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white"
            >
              ログイン
            </Link>
          )}

          {/* ランキングは未認証で閲覧できる（ADR-018）。 */}
          <Link
            to="/ranking"
            className={`rounded border px-5 py-2.5 text-sm ${
              background ? "border-white/60 text-white" : "border-slate-300 dark:border-slate-700"
            }`}
          >
            ログインせずに入場
          </Link>
        </div>

        <Link
          to="/rules"
          className={`text-sm underline ${background ? "text-white/90" : "text-indigo-600 dark:text-indigo-400"}`}
        >
          ルールを読む
        </Link>
      </div>
    </section>
  );
}
