// システム設定の一覧表示（05_Frontend.md 14.3）。参照専用のコンポーネントである。
import type { SystemSettings } from "../../../types/api";

// 表示順と文言。項目の正本は 03_Database.md 10.8 である。
const LABELS: [keyof SystemSettings, string, string][] = [
  ["team_max_members", "チーム人数の上限", "人"],
  ["initial_rating", "初期レート", ""],
  ["rating_k", "K値", ""],
  ["match_rating_range", "許容レート差", ""],
  ["invite_expiration_hours", "招待の有効期限", "時間"],
  ["report_timeout_minutes", "申告期限", "分"],
  ["approve_timeout_minutes", "承認期限", "分"],
  ["max_reject_count", "拒否の上限回数", "回"],
];

export function SystemSettingsTable({ settings }: { settings: SystemSettings }) {
  return (
    <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
      {LABELS.map(([key, label, unit]) => (
        <div key={key} className="flex justify-between px-4 py-2">
          <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
          <dd>
            {settings[key]}
            {unit}
          </dd>
        </div>
      ))}
    </dl>
  );
}
