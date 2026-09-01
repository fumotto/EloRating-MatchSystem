// シーズン画面の停止表示（TC-UI-246〜251 / ADR-034 ⑤ / ADR-038 ③）。
//
// ★シーズンの停止だけを見て「受付中」と表示してはならない。保守停止は別の列であり、
//   シーズンを再開しても解除されない。片方だけを見ると、再開したのにマッチングが
//   動かない状態を「受付中」と表示する。実際にその状態だった。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SeasonOperationState } from "../../../types/season";

let seasonState: SeasonOperationState;

const idle = { mutate: vi.fn(), isPending: false, error: null, data: null };

vi.mock("../hooks/useSeason", () => ({
  useSeasonState: () => ({ data: seasonState, isPending: false }),
  useEndSeason: () => idle,
  useResumeSeason: () => idle,
  usePurgeSeasonData: () => idle,
  useCancelSeasonEnd: () => idle,
}));

vi.mock("../../../services/seasonClient", () => ({ seasonClient: { exportData: vi.fn() } }));
vi.mock("../../../utils/downloadCsv", () => ({ downloadCsv: vi.fn() }));

const { AdminSeasonPage } = await import("./AdminSeasonPage");

const state = (overrides: Partial<SeasonOperationState> = {}): SeasonOperationState => ({
  currentSeason: 4,
  status: "ACTIVE",
  graceUntil: null,
  matchmakingPaused: false,
  updatesLocked: false,
  maintenancePaused: false,
  ...overrides,
});

// 本画面は持ち出しに useMutation を直接使う。Provider が無いと描画できない。
// ★リトライは切る。テスト中に失敗が再試行されると、結果が時間に依存する。
function renderPage(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// 「マッチング」の値だけを読む。画面には他にも状態が並ぶ。
const matchmakingRow = () => screen.getByText("マッチング").nextElementSibling!;

beforeEach(() => {
  seasonState = state();
});

describe("AdminSeasonPage — マッチングの状態表示", () => {
  it("reports matchmaking as open when nothing is paused", () => {
    // TC-UI-246
    renderPage(<AdminSeasonPage />);
    expect(matchmakingRow()).toHaveTextContent("受付中");
  });

  it("reports the season pause", () => {
    // TC-UI-247
    seasonState = state({ matchmakingPaused: true, status: "ENDING" });
    renderPage(<AdminSeasonPage />);

    expect(matchmakingRow()).toHaveTextContent("停止中");
    expect(matchmakingRow()).toHaveTextContent("シーズン");
  });

  it("never reports matchmaking as open while maintenance is on", () => {
    // TC-UI-248 ★これが不具合そのものだった。シーズンは通常営業でも、保守停止中は
    //   queue-match が QUEUE-007 を返す。「受付中」は嘘である。
    seasonState = state({ maintenancePaused: true });
    renderPage(<AdminSeasonPage />);

    expect(matchmakingRow()).toHaveTextContent("停止中");
    expect(matchmakingRow()).toHaveTextContent("保守");
    expect(matchmakingRow()).not.toHaveTextContent("受付中");
  });

  it("names both causes when both pauses are on", () => {
    // TC-UI-249
    seasonState = state({ matchmakingPaused: true, maintenancePaused: true, status: "ENDING" });
    renderPage(<AdminSeasonPage />);

    expect(matchmakingRow()).toHaveTextContent("シーズン・保守");
  });

  it("warns before resuming that maintenance will keep matchmaking down", () => {
    // TC-UI-250 ★押した後に「動かない」と気付く形にしてはならない。
    //   確定済み（ACTIVE かつ updatesLocked）のときに④の区画が出る。
    seasonState = state({ updatesLocked: true, maintenancePaused: true });
    renderPage(<AdminSeasonPage />);

    expect(screen.getByText(/解除するまでマッチングは成立しません/)).toBeInTheDocument();
  });

  it("stays quiet about maintenance when it is not on", () => {
    // TC-UI-251 不要な警告を出さない。
    seasonState = state({ updatesLocked: true });
    renderPage(<AdminSeasonPage />);

    expect(screen.queryByText(/解除するまでマッチングは成立しません/)).toBeNull();
  });
});
