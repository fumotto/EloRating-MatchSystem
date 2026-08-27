// 管理画面のシステム設定（TC-UI-235〜240 / ADR-034 ⑤⑥ / ADR-037 ①②③⑤）。
//
// ★保守による一時停止は、障害時手順の手順1である（ADR-034 ⑥）。ここから立てられないと
//   「無効化した直後に新しい試合が成立する」事故を防げない。実際に配線が漏れていた。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SystemSettings } from "../../../types/api";

const mutate = vi.fn();
let current: SystemSettings;

vi.mock("../../settings/hooks/useSystemSettings", () => ({
  useSystemSettings: () => ({ data: current, isPending: false }),
}));

vi.mock("../hooks/useAdminActions", () => ({
  useAdminUpdateSettings: () => ({ mutate, isPending: false, error: null }),
}));

// 表示設定のフォームは本テストの対象外である。Markdown のプレビューを持ち込むと
// 検証したい導線が埋もれる。
vi.mock("./PresentationSettingsForm", () => ({
  PresentationSettingsForm: () => null,
}));

const { AdminSettingsPage } = await import("./AdminSettingsPage");

const settings = (overrides: Partial<SystemSettings> = {}): SystemSettings => ({
  site_title: "EloRating-MatchSystem",
  background_image_path: null,
  rules_markdown: "",
  announcement_text: "",
  announcement_level: "INFO",
  team_max_members: 3,
  initial_rating: 1500,
  rating_k: 32,
  match_rating_range: 400,
  invite_expiration_hours: 24,
  report_timeout_minutes: 60,
  approve_timeout_minutes: 60,
  max_reject_count: 2,
  season_grace_minutes: 10,
  queue_cooldown_minutes: 30,
  report_extension_minutes: 60,
  max_report_extensions: 3,
  no_show_minutes: 30,
  no_show_response_minutes: 30,
  max_no_contest_requests: 2,
  mutual_no_contest_daily_limit: 3,
  avoidance_days: 30,
  max_avoidance_entries: 5,
  maintenance_paused: false,
  rematch_cooldown_hours: 24,
  ranking_min_opponents: 3,
  ...overrides,
});

beforeEach(() => {
  mutate.mockClear();
  current = settings();
});

describe("AdminSettingsPage", () => {
  it("offers an input for every wired setting", async () => {
    // TC-UI-235 ★Migration だけ足して配線を忘れると、設計書にある設定を運営が変更できない。
    render(<AdminSettingsPage />);

    for (const label of [
      "クールダウンの長さ（分）",
      "1回の延長で伸びる長さ（分）",
      "延長の上限回数",
      "無応答での解散が成立するまで（分）",
      "不成立の申請への応答猶予（分）",
      "1試合あたりの不成立申請の上限",
      "合意不成立を無償で行える1日の件数",
      "ペアの再マッチ抑止の期間（日）",
      "チームあたりの抑止登録数の上限",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("never offers the retired reject limit", () => {
    // TC-UI-236 ★効かない設定を調整できる状態は、設定が足りないのと同じくらい悪い（ADR-037 ③）。
    render(<AdminSettingsPage />);

    expect(screen.queryByLabelText(/拒否の上限回数/)).toBeNull();
  });

  it("turns the maintenance pause on", async () => {
    // TC-UI-237 障害時手順の手順1（ADR-034 ⑥）。
    render(<AdminSettingsPage />);

    await userEvent.click(screen.getByRole("button", { name: "マッチングを停止する" }));

    expect(mutate).toHaveBeenCalledWith({ maintenancePaused: true });
  });

  it("turns the maintenance pause off", async () => {
    // TC-UI-238 ★false を送れないと解除できない。
    current = settings({ maintenance_paused: true });
    render(<AdminSettingsPage />);

    expect(screen.getByText("停止中")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "停止を解除する" }));

    expect(mutate).toHaveBeenCalledWith({ maintenancePaused: false });
  });

  it("states that the pause comes before voiding matches", () => {
    // TC-UI-239 ★逆順にすると、無効化した直後に新しい試合が成立する（ADR-034 ⑥）。
    render(<AdminSettingsPage />);

    expect(screen.getByText(/先にこれを立ててから/)).toBeInTheDocument();
  });

  it("sends only the numeric fields that were filled in", async () => {
    // TC-UI-240 指定のない項目は変更されない（04 12.3）。
    render(<AdminSettingsPage />);

    await userEvent.type(screen.getByLabelText("クールダウンの長さ（分）"), "45");
    await userEvent.click(screen.getByRole("button", { name: "設定を更新" }));

    expect(mutate).toHaveBeenCalledWith(
      { queueCooldownMinutes: 45 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
