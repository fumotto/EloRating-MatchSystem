// AdminLayout（05_Frontend.md 5.1・5.3）。管理者のみが到達できる。
//
// ★管理者判定はセッションJWTの app_metadata.role で行う（ADR-020）。
//   Profile Query に管理者情報を含めない。DBとJWTの二重管理による齟齬を避けるためである。
//   権限付与の直後は反映されない。再ログインかトークンのリフレッシュまで一般利用者として扱われる。
//
// 未充足時はリダイレクトせず403画面を表示する（5.3の表）。
// 画面側のガードは利便性のためであり、認可の保証はバックエンドが行う。
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Header } from "../components/layout/Header";

function AdminForbidden() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="font-medium">この画面を表示する権限がありません</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        管理者権限を付与された直後は、再ログインするまで反映されません。
      </p>
      <Link to="/dashboard" className="mt-4 inline-block text-sm text-indigo-600">
        ダッシュボードへ戻る
      </Link>
    </div>
  );
}

function AdminLayout() {
  return (
    <>
      <Header>
        <Link to="/admin" className="text-sm text-slate-600 dark:text-slate-300">
          管理
        </Link>
        <Link to="/dashboard" className="text-sm text-slate-600 dark:text-slate-300">
          アプリへ戻る
        </Link>
      </Header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}

export const Route = createFileRoute("/_admin")({
  beforeLoad: ({ context }) => {
    // 未ログインも管理者でないのも、ここでは同じく403として扱う。
    // どちらであるかを伝えると、管理画面の存在と自分の権限状態が推測できてしまう。
    const isAdmin = context.session?.user.app_metadata?.role === "admin";
    return { isAdmin };
  },
  component: function AdminRoute() {
    const { isAdmin } = Route.useRouteContext();
    return isAdmin ? <AdminLayout /> : <AdminForbidden />;
  },
});
