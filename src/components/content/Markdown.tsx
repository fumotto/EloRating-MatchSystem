// Markdown の描画（Issue #8）。
//
// ★本文は運営が管理画面から入力する。管理者は信頼できるが、それでも
//   サニタイズを外してはならない。管理者アカウントが乗っ取られた場合、
//   ルールページが全利用者へスクリプトを配る経路になるためである。
//
// ★dangerouslySetInnerHTML を使うのは本モジュールだけとする。
//   他所へ散らすと、どこか1箇所でサニタイズを忘れた時点で防御が崩れる。
//   marked で HTML 化し、必ず DOMPurify を通してから渡す。
import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";

// 許可するタグ。ルールページに必要な範囲へ絞る。
// ★iframe・script・style・form は許さない。img も許さない
//   （外部読み込みは追跡の経路になり、背景画像を public/ に限った方針と矛盾する）。
const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "del",
  "code",
  "pre",
  "blockquote",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const ALLOWED_ATTR = ["href", "title"];

export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => {
    // marked の同期APIを使う。非同期拡張は入れていない。
    const raw = marked.parse(source, { async: false, gfm: true, breaks: true }) as string;

    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      // javascript: などのスキームを弾く。href は http/https/mailto のみ通す。
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
    });
  }, [source]);

  if (source.trim().length === 0) return null;

  return (
    <div
      className="markdown space-y-3 text-sm leading-relaxed"
      // ★上で必ず DOMPurify を通している。ここへ生の値を渡してはならない。
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
