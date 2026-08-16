// 運営からのお知らせ（Issue #7）。
//
// ★テキストが空なら帯そのものを出さない。
//   空の帯が残ると、常時1行分の余白が空いて「何か壊れている」ように見える。
import { usePublicSettings } from "../../features/settings/hooks/usePublicSettings";
import type { AnnouncementLevel } from "../../types/api";

// 帯の配色。
//
// ★文字色はどの帯でも白に固定し、背景を十分濃くする。
//   帯ごとに文字色を変えると、色覚特性によっては読めない組み合わせが生まれる。
//   濃い背景＋白文字なら、3種いずれもコントラストを確保できる。
//
// ★色だけで深刻度を伝えない。記号を併記する。色を区別できない利用者にも
//   差が伝わるようにするためである。
const STYLES: Record<AnnouncementLevel, { className: string; mark: string; label: string }> = {
  INFO: { className: "bg-emerald-700", mark: "●", label: "お知らせ" },
  WARN: { className: "bg-amber-600", mark: "▲", label: "注意" },
  ALERT: { className: "bg-red-700", mark: "■", label: "重要" },
};

export function AnnouncementBanner() {
  const { data: settings } = usePublicSettings();

  const text = settings?.announcement_text?.trim() ?? "";
  if (text.length === 0) return null;

  // 未知の値が入っていても落とさない。既定の INFO として扱う。
  const level = (settings?.announcement_level ?? "INFO") as AnnouncementLevel;
  const style = STYLES[level] ?? STYLES.INFO;

  return (
    <div role="status" className={`${style.className} text-white`}>
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2 text-sm">
        <span aria-hidden="true">{style.mark}</span>
        <span className="sr-only">{style.label}：</span>
        {/* 1行に収める。長文はルールページへ書く運用とする。 */}
        <span className="truncate">{text}</span>
      </div>
    </div>
  );
}
