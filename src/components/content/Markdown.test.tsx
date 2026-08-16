// Markdown 描画のサニタイズ検証（Issue #8）。
//
// ★本モジュールは dangerouslySetInnerHTML を使う唯一の箇所である。
//   防御が効いていることをテストで固定する。ここが崩れると、
//   管理画面から全利用者へスクリプトを配れてしまう。
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

const html = (source: string) => {
  const { container } = render(<Markdown source={source} />);
  return container.innerHTML;
};

describe("Markdown", () => {
  it("renders basic markdown", () => {
    render(<Markdown source={"# 見出し\n\n- 項目1\n- 項目2"} />);
    expect(screen.getByRole("heading", { name: "見出し" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders nothing for empty input", () => {
    const { container } = render(<Markdown source="   " />);
    expect(container.innerHTML).toBe("");
  });

  it("strips script tags", () => {
    const out = html("<script>window.__pwned = 1</script>\n\n本文");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("__pwned");
  });

  it("strips inline event handlers", () => {
    const out = html('<p onclick="window.__pwned=1">押して</p>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("__pwned");
  });

  it("strips javascript: links", () => {
    // Markdown 記法からのリンクも素通ししない。
    const out = html("[押して](javascript:alert(1))");
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("strips iframes and images", () => {
    // 外部読み込みは追跡の経路になるため許可しない。
    const out = html(
      '<iframe src="https://example.com"></iframe>\n\n![x](https://example.com/a.png)',
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<img");
  });

  it("strips style tags and attributes", () => {
    const out = html('<style>body{display:none}</style>\n<p style="color:red">文</p>');
    expect(out).not.toContain("<style");
    expect(out).not.toContain("style=");
  });

  it("keeps safe links", () => {
    const out = html("[ルール](https://example.com/rules)");
    expect(out).toContain('href="https://example.com/rules"');
  });

  it("escapes text that looks like html", () => {
    // 記法として書かれた文字はそのまま文字として出る。
    render(<Markdown source={"`<script>alert(1)</script>`"} />);
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  });
});
