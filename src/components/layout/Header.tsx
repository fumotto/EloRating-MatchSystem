// 共通ヘッダー。Layout に業務ロジックを実装しない（05_Frontend.md 6章）。
import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "../../stores/themeStore";

interface HeaderProps {
  children?: React.ReactNode;
}

export function Header({ children }: HeaderProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);

  return (
    <header className="border-b border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
        <Link to="/" className="font-semibold">
          EloRating
        </Link>
        <Link to="/ranking" className="text-sm text-slate-600 dark:text-slate-300">
          ランキング
        </Link>
        <div className="ml-auto flex items-center gap-3">
          {children}
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "light" ? "ダークモードに切り替え" : "ライトモードに切り替え"}
            className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
