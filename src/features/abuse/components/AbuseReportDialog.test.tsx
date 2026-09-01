// 通報フォーム（TC-UI-215〜219 / ADR-033）。
//
// ★証拠を必須にしない。必須にすると、記録を残していない正当な訴えが出せなくなり、
//   累積による判断（ADR-033 ④）の材料も集まらない。
// ★送信後に「調査します」「対応します」と書かない。単発では措置しないためである。
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AbuseReportDialog } from "./AbuseReportDialog";

const mutate = vi.fn();

vi.mock("../hooks/useAbuseReports", () => ({
  useCreateAbuseReport: () => ({
    mutate,
    isPending: false,
    isSuccess: false,
    error: null,
  }),
}));

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AbuseReportDialog
        targetTeamId="team-b"
        targetTeamName="相手チーム"
        matchId="match-1"
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
};

describe("AbuseReportDialog", () => {
  it("requires a detail in the report form", async () => {
    // TC-UI-215 自由記述が短いうちは送信できない
    setup();
    expect(screen.getByRole("button", { name: "通報する" })).toBeDisabled();
  });

  it("shows the remaining character count", async () => {
    // TC-UI-216
    setup();
    await userEvent.type(screen.getByLabelText("何があったか"), "あいう");
    expect(screen.getByText(/あと 7 文字以上/)).toBeInTheDocument();
  });

  it("submits a report without evidence", async () => {
    // TC-UI-217 ★証拠なしで送信できる
    setup();
    await userEvent.type(
      screen.getByLabelText("何があったか"),
      "勝っていないのに勝利を申告されました",
    );
    await userEvent.click(screen.getByRole("button", { name: "通報する" }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate.mock.calls[0][0].evidenceUrls).toEqual([]);
  });

  it("never sends a reporter team id", async () => {
    // TC-SEC-042 の対。所属チームはサーバがJWTから導出する
    setup();
    await userEvent.type(
      screen.getByLabelText("何があったか"),
      "勝っていないのに勝利を申告されました",
    );
    await userEvent.click(screen.getByRole("button", { name: "通報する" }));
    expect(mutate.mock.calls.at(-1)?.[0]).not.toHaveProperty("reporterTeamId");
  });

  it("tells the user that evidence is optional", () => {
    // TC-UI-218
    setup();
    expect(screen.getByText(/証拠が無くても通報できます/)).toBeInTheDocument();
  });

  it("states that a settled result will not change", () => {
    // ADR-033 ① 期待の管理。存在しない救済を示唆しない
    setup();
    expect(screen.getByText(/確定した結果も変わりません/)).toBeInTheDocument();
  });
});
