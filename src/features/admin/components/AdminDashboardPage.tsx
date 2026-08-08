// Page（05_Frontend.md 3.2）。管理者向けの入口。
import { Link } from "@tanstack/react-router";

const SECTIONS = [
  { to: "/admin/teams", title: "チーム管理", description: "BANと解除を行います。" },
  { to: "/admin/settings", title: "システム設定", description: "K値・期限・上限を変更します。" },
  { to: "/admin/audit", title: "監査ログ", description: "実行された操作の履歴を確認します。" },
] as const;

export function AdminDashboardPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">管理</h1>
      <ul className="space-y-2">
        {SECTIONS.map((section) => (
          <li key={section.to}>
            <Link
              to={section.to}
              className="block rounded-lg border border-slate-200 p-4 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
            >
              <p className="font-medium">{section.title}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {section.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
