// Page（05_Frontend.md 3.2）。システム設定の変更。
//
// ★レートリセットの導線は持たない。レートの初期化はシーズンリセットへ一本化した（ADR-031）。
//
// ★シーズンの状態（`matchmaking_paused` / `updates_locked` / `current_season`）は本画面から
//   触れない（ADR-037 ②）。シーズン運用の Function だけが書き換える。保守の停止は
//   別列の `maintenance_paused` であり、そちらは本画面から切り替える（ADR-034 ⑤）。
import { useState } from "react";
import { useSystemSettings } from "../../settings/hooks/useSystemSettings";
import { useAdminUpdateSettings } from "../hooks/useAdminActions";
import { SystemSettingsTable } from "../../settings/components/SystemSettingsTable";
import { PresentationSettingsForm } from "./PresentationSettingsForm";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";
import type { UpdateSystemSettingsRequest } from "../../../types/api";

// 入力欄の定義。範囲は system_settings の CHECK制約に合わせる（03_Database.md 10.8）。
// 範囲外は ADMIN-002 が返るため、画面側でも同じ境界を示して往復を減らす。
//
// ★キーは数値項目に限る。表示設定（siteTitle 等）は文字列であり、
//   本フォームの「入力のあった項目を Number() で送る」経路に乗らない。
//   そちらは PresentationSettingsForm が扱う（Issue #8）。保守の停止は真偽値であり、
//   これも本フォームには乗らない。専用のトグルで扱う。
//
// ★廃止した設定（`maxRejectCount` / ADR-032 ③）を並べてはならない（ADR-037 ③）。
//   値は誰も読まない。操作できる場所へ置くと、効かない設定を運営が調整してしまう。
type NumericSettingKey = {
  [K in keyof UpdateSystemSettingsRequest]-?: UpdateSystemSettingsRequest[K] extends
    | number
    | undefined
    ? K
    : never;
}[keyof UpdateSystemSettingsRequest];

interface NumericField {
  key: NumericSettingKey;
  label: string;
  min: number;
  max?: number;
}

// 項目が多いため、意味のまとまりで区切る。区切りは 03_Database.md 10.8 の節に対応する。
const GROUPS: { title: string; note?: string; fields: NumericField[] }[] = [
  {
    title: "チームとレート",
    fields: [
      // 1人チームを許す（Issue #4 / Migration 0017）。
      { key: "teamMaxMembers", label: "チーム人数の上限", min: 1 },
      { key: "initialRating", label: "初期レート", min: 100 },
      { key: "ratingK", label: "K値", min: 1, max: 128 },
      { key: "matchRatingRange", label: "許容レート差", min: 1 },
      { key: "inviteExpirationHours", label: "招待の有効期限（時間）", min: 1 },
    ],
  },
  {
    title: "勝敗報告の期限",
    note: "申告期限を延ばすほど、報告せず放置する妨害の効果時間が延びます（ADR-032 ⑦）。長い対戦は延長で扱ってください。",
    fields: [
      { key: "reportTimeoutMinutes", label: "申告期限（分）", min: 1 },
      { key: "approveTimeoutMinutes", label: "承認期限（分）", min: 1 },
      { key: "reportExtensionMinutes", label: "1回の延長で伸びる長さ（分）", min: 1 },
      { key: "maxReportExtensions", label: "延長の上限回数", min: 0 },
      { key: "queueCooldownMinutes", label: "クールダウンの長さ（分）", min: 1 },
    ],
  },
  {
    title: "対戦の不成立",
    note: "不成立の申請と、回線相性によるペアの再マッチ抑止に関する値です（ADR-032 ⑧ / ADR-034 ②③）。",
    fields: [
      { key: "noShowMinutes", label: "無応答での解散が成立するまで（分）", min: 1 },
      { key: "noShowResponseMinutes", label: "不成立の申請への応答猶予（分）", min: 1 },
      { key: "maxNoContestRequests", label: "1試合あたりの不成立申請の上限", min: 0 },
      { key: "mutualNoContestDailyLimit", label: "合意不成立を無償で行える1日の件数", min: 0 },
      { key: "avoidanceDays", label: "ペアの再マッチ抑止の期間（日）", min: 1 },
      { key: "maxAvoidanceEntries", label: "チームあたりの抑止登録数の上限", min: 0 },
    ],
  },
  {
    title: "サブアカウント対策",
    note: "どちらも 0 で無効になります。検証環境で複数アカウントを扱うときは 0 にしてください（ADR-036 ⑤）。",
    fields: [
      { key: "rematchCooldownHours", label: "同じ相手と再戦できない長さ（時間・0で無効）", min: 0 },
      { key: "rankingMinOpponents", label: "ランキング掲載の最低対戦相手数（0で無効）", min: 0 },
    ],
  },
  {
    title: "シーズン",
    fields: [
      // シーズン終了時に進行中の試合を待つ長さ（Issue #9）。
      { key: "seasonGraceMinutes", label: "シーズン終了の猶予（分）", min: 1, max: 1440 },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((group) => group.fields);

export function AdminSettingsPage() {
  const { data: settings, isPending } = useSystemSettings();
  const updateSettings = useAdminUpdateSettings();
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    // 入力のあった項目だけを送る。指定のない項目は変更されない（04 12.3）。
    const request: UpdateSystemSettingsRequest = {};
    for (const field of ALL_FIELDS) {
      const raw = inputs[field.key];
      if (raw === undefined || raw === "") continue;
      request[field.key] = Number(raw);
    }

    if (Object.keys(request).length === 0) return;
    updateSettings.mutate(request, { onSuccess: () => setInputs({}) });
  };

  // 保守による一時停止（ADR-034 ⑤）。数値フォームとは独立して即座に切り替える。
  // ★シーズン終了に伴うマッチング停止とは別の列である。兼用してはならない。
  const toggleMaintenance = () => {
    if (!settings) return;
    updateSettings.mutate({ maintenancePaused: !settings.maintenance_paused });
  };

  const failureCode = apiErrorCode(updateSettings.error);

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">システム設定</h1>

      {isPending ? <p className="text-sm text-slate-500">読み込み中…</p> : null}
      {settings ? <SystemSettingsTable settings={settings} /> : null}

      {/* 保守による一時停止（ADR-034 ⑤）。障害時の手順は手順1がこれである。 */}
      {settings ? (
        <div className="space-y-2 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-sm font-medium">保守による一時停止</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            停止中は新しいマッチングが成立しません（進行中の試合はそのまま進みます）。
            ゲーム側の障害やメンテナンスのときに使います。
            <strong className="font-medium">
              先にこれを立ててから、進行中の試合を無効化してください。
            </strong>
            逆順にすると、無効化した直後に新しい試合が成立します。
          </p>
          <p className="text-sm">
            現在：
            {settings.maintenance_paused ? (
              <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                停止中
              </span>
            ) : (
              <span className="ml-1 text-slate-500 dark:text-slate-400">稼働中</span>
            )}
          </p>
          <button
            type="button"
            onClick={toggleMaintenance}
            disabled={updateSettings.isPending}
            className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
          >
            {settings.maintenance_paused ? "停止を解除する" : "マッチングを停止する"}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            シーズン終了に伴うマッチング停止とは別の仕組みです。
            シーズンの操作はこの停止を解除しません。
          </p>
        </div>
      ) : null}

      {/* 表示設定は入力の性質が数値と異なるため別フォームにする（Issue #8）。 */}
      {settings ? <PresentationSettingsForm settings={settings} /> : null}

      <form onSubmit={submit} className="space-y-5">
        <h2 className="text-sm font-medium">変更する項目のみ入力してください</h2>

        {GROUPS.map((group) => (
          <fieldset key={group.title} className="space-y-3">
            <legend className="text-sm font-medium">{group.title}</legend>
            {group.note ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{group.note}</p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {group.fields.map((field) => (
                <div key={field.key}>
                  <label htmlFor={field.key} className="block text-sm">
                    {field.label}
                  </label>
                  <input
                    id={field.key}
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={inputs[field.key] ?? ""}
                    onChange={(e) =>
                      setInputs((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ))}

        <button
          type="submit"
          disabled={updateSettings.isPending}
          className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {updateSettings.isPending ? "更新中…" : "設定を更新"}
        </button>
      </form>

      {failureCode ? <ErrorNotice code={failureCode} /> : null}
    </section>
  );
}
