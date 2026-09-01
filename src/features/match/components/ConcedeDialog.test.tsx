// 投了の確認ダイアログ（TC-UI-201〜205 / ADR-032 ① / ADR-033 ①）。
//
// ★投了の押し間違えは覆せない。確認だけが防御であり、それを省略可能にすると防御が消える。
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConcedeDialog } from "./ConcedeDialog";

const setup = () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConcedeDialog
      opponentName="対戦相手チーム"
      isPending={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
};

describe("ConcedeDialog", () => {
  it("names the opponent in the concession dialog", () => {
    // TC-UI-202 相手チーム名を明示する。押し間違いの唯一の手がかりである
    setup();
    expect(screen.getByText("対戦相手チーム")).toBeInTheDocument();
  });

  it("warns that a concession cannot be undone", () => {
    // TC-UI-203
    setup();
    expect(screen.getByText(/取り消せません/)).toBeInTheDocument();
  });

  it("offers no way to skip the confirmation", () => {
    // TC-UI-204 ★「次回から表示しない」を設けてはならない
    setup();
    expect(screen.queryByText(/次回から/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("aborts the concession on cancel", async () => {
    // TC-UI-205
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms only through the explicit confirm action", async () => {
    // TC-UI-201 の対。確定はこのボタンだけが行う
    const { onConfirm } = setup();
    await userEvent.click(screen.getByRole("button", { name: "確定する" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("focuses the cancel action by default", () => {
    // Enter の連打で確定させない
    setup();
    expect(screen.getByRole("button", { name: "やめる" })).toHaveFocus();
  });
});
