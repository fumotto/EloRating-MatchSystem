// Page（05_Frontend.md 3.2）。システム設定の変更。
//
// ★レートリセットの導線は持たない。レートの初期化はシーズンリセットへ一本化した（ADR-031）。
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
//   そちらは PresentationSettingsForm が扱う（Issue #8）。
type NumericSettingKey = {
  [K in keyof UpdateSystemSettingsRequest]-?: UpdateSystemSettingsRequest[K] extends
    | number
    | undefined
    ? K
    : never;
}[keyof UpdateSystemSettingsRequest];

const FIELDS: {
  key: NumericSettingKey;
  label: string;
  min: number;
  max?: number;
}[] = [
  // 1人チームを許す（Issue #4 / Migration 0017）。
  { key: "teamMaxMembers", label: "チーム人数の上限", min: 1 },
  { key: "initialRating", label: "初期レート", min: 100 },
  { key: "ratingK", label: "K値", min: 1, max: 128 },
  { key: "matchRatingRange", label: "許容レート差", min: 1 },
  { key: "inviteExpirationHours", label: "招待の有効期限（時間）", min: 1 },
  { key: "reportTimeoutMinutes", label: "申告期限（分）", min: 1 },
  { key: "approveTimeoutMinutes", label: "承認期限（分）", min: 1 },
  { key: "maxRejectCount", label: "拒否の上限回数", min: 0 },
  // シーズン終了時に進行中の試合を待つ長さ（Issue #9）。
  { key: "seasonGraceMinutes", label: "シーズン終了の猶予（分）", min: 1, max: 1440 },
];

export function AdminSettingsPage() {
  const { data: settings, isPending } = useSystemSettings();
  const updateSettings = useAdminUpdateSettings();
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    // 入力のあった項目だけを送る。指定のない項目は変更されない（04 12.3）。
    const request: UpdateSystemSettingsRequest = {};
    for (const field of FIELDS) {
      const raw = inputs[field.key];
      if (raw === undefined || raw === "") continue;
      request[field.key] = Number(raw);
    }

    if (Object.keys(request).length === 0) return;
    updateSettings.mutate(request, { onSuccess: () => setInputs({}) });
  };

  const failureCode = apiErrorCode(updateSettings.error);

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">システム設定</h1>

      {isPending ? <p className="text-sm text-slate-500">読み込み中…</p> : null}
      {settings ? <SystemSettingsTable settings={settings} /> : null}

      {/* 表示設定は入力の性質が数値と異なるため別フォームにする（Issue #8）。 */}
      {settings ? <PresentationSettingsForm settings={settings} /> : null}

      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-sm font-medium">変更する項目のみ入力してください</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((field) => (
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
                onChange={(e) => setInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          ))}
        </div>

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
