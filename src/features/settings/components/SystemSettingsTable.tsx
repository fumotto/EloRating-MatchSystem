// システム設定の一覧表示（05_Frontend.md 14.3）。参照専用のコンポーネントである。
import type { SystemSettings } from "../../../types/api";

// 表示順と文言。項目の正本は 03_Database.md 10.8 である。
//
// ★廃止した設定（`max_reject_count` / ADR-032 ③）を並べてはならない（ADR-037 ③）。
//   値は誰も読まない。表に載せると、効いている設定として読まれる。
//
// ★シーズンの状態（`matchmaking_paused` / `updates_locked` / `current_season`）も載せない。
//   本表は「運営が調整する設定」の一覧であり、進行中の状態はシーズン画面が示す（ADR-037 ②）。
const LABELS: [keyof SystemSettings, string, string][] = [
  ["team_max_members", "チーム人数の上限", "人"],
  ["initial_rating", "初期レート", ""],
  ["rating_k", "K値", ""],
  ["match_rating_range", "許容レート差", ""],
  ["invite_expiration_hours", "招待の有効期限", "時間"],
  ["report_timeout_minutes", "申告期限", "分"],
  ["approve_timeout_minutes", "承認期限", "分"],
  ["report_extension_minutes", "1回の延長で伸びる長さ", "分"],
  ["max_report_extensions", "延長の上限回数", "回"],
  ["queue_cooldown_minutes", "クールダウンの長さ", "分"],
  ["no_show_minutes", "無応答での解散が成立するまで", "分"],
  ["no_show_response_minutes", "不成立の申請への応答猶予", "分"],
  ["max_no_contest_requests", "1試合あたりの不成立申請の上限", "回"],
  ["mutual_no_contest_daily_limit", "合意不成立を無償で行える1日の件数", "件"],
  ["avoidance_days", "ペアの再マッチ抑止の期間", "日"],
  ["max_avoidance_entries", "チームあたりの抑止登録数の上限", "件"],
  ["rematch_cooldown_hours", "同じ相手と再戦できない長さ", "時間"],
  ["ranking_min_opponents", "ランキング掲載の最低対戦相手数", "チーム"],
  ["season_grace_minutes", "シーズン終了の猶予", "分"],
];

// 0 が「無効」を意味する設定（ADR-036 ⑤）。数値のまま出すと、
// 「0時間だけ抑止する」という誤読を招く。
const DISABLED_BY_ZERO: (keyof SystemSettings)[] = [
  "rematch_cooldown_hours",
  "ranking_min_opponents",
];

function display(settings: SystemSettings, key: keyof SystemSettings, unit: string): string {
  const value = settings[key];
  if (typeof value === "number" && value === 0 && DISABLED_BY_ZERO.includes(key)) {
    return "無効";
  }
  return `${String(value)}${unit}`;
}

export function SystemSettingsTable({ settings }: { settings: SystemSettings }) {
  return (
    <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
      {LABELS.map(([key, label, unit]) => (
        <div key={key} className="flex justify-between px-4 py-2">
          <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
          <dd>{display(settings, key, unit)}</dd>
        </div>
      ))}
    </dl>
  );
}
