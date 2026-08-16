// トップページとルールページの表示設定（Issue #8）。
//
// ★数値設定とはフォームを分ける。あちらは「変えたい項目だけ入力する」形だが、
//   こちらは現在値を初期表示して編集する形が自然である（本文を毎回書き直せない）。
import { useEffect, useState } from "react";
import { useAdminUpdateSettings } from "../hooks/useAdminActions";
import { Markdown } from "../../../components/content/Markdown";
import { ErrorNotice } from "../../../components/feedback/ErrorNotice";
import { apiErrorCode } from "../../../utils/apiErrorCode";
import type { SystemSettings } from "../../../types/api";

// 制約は Migration 0018 の CHECK と Edge Function の検証に合わせる。
const TITLE_MAX = 60;
const PATH_MAX = 200;
const RULES_MAX = 20000;

export function PresentationSettingsForm({ settings }: { settings: SystemSettings }) {
  const update = useAdminUpdateSettings();

  const [title, setTitle] = useState(settings.site_title);
  const [path, setPath] = useState(settings.background_image_path ?? "");
  const [rules, setRules] = useState(settings.rules_markdown);
  const [preview, setPreview] = useState(false);

  // 他の管理者が変更した場合に追随する（Realtime で settings が再取得される）。
  useEffect(() => {
    setTitle(settings.site_title);
    setPath(settings.background_image_path ?? "");
    setRules(settings.rules_markdown);
  }, [settings.site_title, settings.background_image_path, settings.rules_markdown]);

  const failureCode = apiErrorCode(update.error);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({
      siteTitle: title,
      // 空文字は解除を意味する（Edge Function 側で NULL にする）。
      backgroundImagePath: path,
      rulesMarkdown: rules,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-sm font-medium">トップページとルール</h2>

      <div>
        <label htmlFor="site-title" className="block text-sm">
          サイト名
        </label>
        <input
          id="site-title"
          type="text"
          maxLength={TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div>
        <label htmlFor="bg-path" className="block text-sm">
          背景画像
        </label>
        <input
          id="bg-path"
          type="text"
          maxLength={PATH_MAX}
          placeholder="bg.jpg"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        {/*
          ★アップロード機能は持たない。画像は public/ へ置いて commit する
            （Storage を使用しないため / 11_Deployment.md 2章）。
            外部URLは受け付けない。DBとEdge Functionの双方で弾いている。
        */}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          <code>public/</code> へ置いた画像のファイル名を入れます（例：<code>bg.jpg</code>）。
          外部サイトのURLは使えません。空にすると背景なしに戻ります。
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="rules-md" className="block text-sm">
            ルール本文（Markdown）
          </label>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="text-xs text-indigo-600 dark:text-indigo-400"
          >
            {preview ? "編集に戻る" : "プレビュー"}
          </button>
        </div>

        {preview ? (
          <div className="mt-1 min-h-40 rounded border border-slate-300 p-3 dark:border-slate-700">
            <Markdown source={rules} />
          </div>
        ) : (
          <textarea
            id="rules-md"
            rows={14}
            maxLength={RULES_MAX}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        )}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          見出し・箇条書き・強調・リンク・表が使えます。{rules.length} / {RULES_MAX} 文字
        </p>
      </div>

      {failureCode ? <ErrorNotice code={failureCode} /> : null}

      <button
        type="submit"
        disabled={update.isPending}
        className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {update.isPending ? "保存中…" : "表示設定を保存"}
      </button>
    </form>
  );
}
