// Page（05_Frontend.md 3.2）。ルールページ（Issue #8）。
//
// ★ログイン状態を問わず誰でも閲覧できる。
//   本文は運営が管理画面から Markdown で入力する。描画は Markdown コンポーネントが
//   サニタイズしたうえで行う（インジェクション対策はそちらに集約している）。
import { usePublicSettings } from "../../settings/hooks/usePublicSettings";
import { Markdown } from "../../../components/content/Markdown";
import { EmptyState } from "../../../components/feedback/EmptyState";

export function RulesPage() {
  const { data: settings, isPending } = usePublicSettings();

  if (isPending) return <p className="text-sm text-slate-500">読み込み中…</p>;

  const source = settings?.rules_markdown ?? "";

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">ルール</h1>

      {source.trim().length === 0 ? (
        <EmptyState
          title="ルールはまだ登録されていません"
          description="運営が設定画面から登録すると、ここに表示されます。"
        />
      ) : (
        <Markdown source={source} />
      )}
    </section>
  );
}
