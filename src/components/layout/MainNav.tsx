// 共通ナビゲーション（05_Frontend.md 6章）。Layout に業務ロジックを実装しない。
//
// ★PublicLayout と AppLayout で共有する。項目をレイアウトごとに書くと、
//   公開ルート（/ranking）でだけ導線が欠ける状態が再発する。定義はここが唯一の出所である。
import { Link } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { useLogout } from "../../features/auth/hooks/useLogout";

// ランキングは Header が常時表示するため、ここには含めない（重複を避ける）。
const NAV = [
  { to: "/dashboard", label: "ダッシュボード" },
  { to: "/team", label: "マイチーム" },
  { to: "/matchmaking", label: "マッチング" },
  { to: "/matches", label: "試合" },
  { to: "/profile", label: "プロフィール" },
  { to: "/settings", label: "設定" },
] as const;

const LINK_CLASS = "text-sm text-slate-600 dark:text-slate-300";

interface MainNavProps {
  session: Session | null;
}

export function MainNav({ session }: MainNavProps) {
  const { logout, isPending, message } = useLogout();

  if (!session) {
    return (
      <Link to="/login" className={LINK_CLASS}>
        ログイン
      </Link>
    );
  }

  // 管理者判定はJWTの app_metadata.role（ADR-020）。
  const isAdmin = session.user.app_metadata?.role === "admin";

  return (
    <nav className="flex flex-wrap items-center gap-3">
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={LINK_CLASS}
          activeProps={{ className: "text-sm font-medium text-indigo-600" }}
        >
          {item.label}
        </Link>
      ))}
      {/* 管理者にのみ導線を出す。 */}
      {isAdmin ? (
        <Link to="/admin" className={LINK_CLASS}>
          管理
        </Link>
      ) : null}
      <button
        type="button"
        onClick={() => void logout()}
        disabled={isPending}
        className={`${LINK_CLASS} disabled:opacity-50`}
      >
        {isPending ? "ログアウト中…" : "ログアウト"}
      </button>
      {/* ログアウトに失敗した場合。黙って握り潰すと、押しても何も起きないように見える。 */}
      {message ? (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </span>
      ) : null}
    </nav>
  );
}
