// Page（05_Frontend.md 3.2）。管理者向けの入口。
import { Link } from "@tanstack/react-router";

const SECTIONS = [
  { to: "/admin/teams", title: "チーム管理", description: "BANと解除を行います。" },
  { to: "/admin/settings", title: "システム設定", description: "K値・期限・上限を変更します。" },
  {
    to: "/admin/matches",
    title: "対戦カードを用意する",
    description: "大会・イベント用に、対戦する2チームを直接指定します。",
  },
  {
    to: "/admin/reports",
    title: "通報",
    description: "未処理の通報と累積を確認します。単発では措置しません。",
  },
  {
    to: "/admin/integrity",
    title: "対戦の偏り",
    description: "繰り返し当たっている組み合わせと、稼ぎ先の偏りを確認します。",
  },
  { to: "/admin/audit", title: "監査ログ", description: "実行された操作の履歴を確認します。" },
  {
    to: "/admin/season",
    title: "シーズン",
    description: "シーズンの終了・データの持ち出し・削除を行います。",
  },
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
