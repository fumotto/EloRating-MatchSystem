// Page（05_Frontend.md 3.2）。利用者向けの設定表示。
//
// 変更できるのは管理者だけである（/admin/settings）。ここは参照のみ。
import { useSystemSettings } from "../hooks/useSystemSettings";
import { useThemeStore } from "../../../stores/themeStore";
import { SystemSettingsTable } from "./SystemSettingsTable";

// マニュアルは public/guide/ 配下の静的HTMLである（00_DirectoryStructure.md 8章）。
// 正本は docs/PlayerGuide.md と docs/ForkGuide.md であり、ここは導線のみを持つ。
const GUIDES = [
  {
    file: "player.html",
    title: "使い方ガイド",
    description: "チームの作り方、対戦の進め方、レートの仕組み",
  },
  {
    file: "operator.html",
    title: "導入・運営ガイド",
    description: "このサイトを自分で立ち上げて運営する人向け",
  },
] as const;

export function SettingsPage() {
  const { data: settings, isPending } = useSystemSettings();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">設定</h1>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">表示</h2>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
        >
          テーマを切り替える（現在：{theme === "dark" ? "ダーク" : "ライト"}）
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">システム設定</h2>
        {isPending ? <p className="text-sm text-slate-500">読み込み中…</p> : null}
        {settings ? <SystemSettingsTable settings={settings} /> : null}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">マニュアル</h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
          {GUIDES.map((guide) => (
            <li key={guide.file}>
              {/*
                ★TanStack Router の Link ではなく素の a を使う。
                  遷移先は SPA のルートではなく public/ 配下の静的HTMLであり、
                  Link を使うとルータが解決できず notFound になる。
                  BASE_URL は末尾スラッシュ付きで与えられる（サブパス配信）。
              */}
              <a
                href={`${import.meta.env.BASE_URL}guide/${guide.file}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <span>
                  <span className="font-medium">{guide.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {guide.description}
                  </span>
                </span>
                <span aria-hidden="true" className="text-slate-400">
                  ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
