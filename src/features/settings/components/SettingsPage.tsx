// Page（05_Frontend.md 3.2）。利用者向けの設定表示。
//
// 変更できるのは管理者だけである（/admin/settings）。ここは参照のみ。
import { useSystemSettings } from "../hooks/useSystemSettings";
import { useThemeStore } from "../../../stores/themeStore";
import { SystemSettingsTable } from "./SystemSettingsTable";

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
    </section>
  );
}
