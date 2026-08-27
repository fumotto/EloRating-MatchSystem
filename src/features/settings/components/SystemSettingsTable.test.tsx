// システム設定の一覧表示（TC-UI-230〜234 / ADR-036 ⑤ / ADR-037 ③④）。
//
// ★廃止した設定を並べないこと、0 を「無効」と読ませることを守る。
//   どちらも表示の問題に見えるが、運営が設定を誤解する経路そのものである。
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SystemSettingsTable } from "./SystemSettingsTable";
import type { SystemSettings } from "../../../types/api";

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

describe("SystemSettingsTable", () => {
  it("shows the settings added for the report flow", () => {
    // TC-UI-230 ★列を足してAPIへ配線しても、一覧に出さなければ運営は現在値を確認できない。
    render(<SystemSettingsTable settings={settings()} />);

    expect(screen.getByText("クールダウンの長さ")).toBeInTheDocument();
    expect(screen.getByText("ペアの再マッチ抑止の期間")).toBeInTheDocument();
    expect(screen.getByText("同じ相手と再戦できない長さ")).toBeInTheDocument();
  });

  it("never lists the retired reject limit", () => {
    // TC-UI-231 ★廃止した設定（ADR-032 ③ / ADR-037 ③）。
    //   表に載せると、効いている設定として読まれる。
    render(<SystemSettingsTable settings={settings()} />);

    expect(screen.queryByText("拒否の上限回数")).toBeNull();
  });

  it("never lists the season state columns", () => {
    // TC-UI-232 ★本表は「運営が調整する設定」の一覧である（ADR-037 ②）。
    render(<SystemSettingsTable settings={settings()} />);

    expect(screen.queryByText(/マッチングの停止/)).toBeNull();
    expect(screen.queryByText(/現在のシーズン/)).toBeNull();
  });

  it("reads zero as disabled for the sub-account guard", () => {
    // TC-UI-233 ★「0時間だけ抑止する」と読ませない（ADR-037 ④）。
    render(<SystemSettingsTable settings={settings({ rematch_cooldown_hours: 0 })} />);

    const row = screen.getByText("同じ相手と再戦できない長さ").parentElement!;
    expect(row).toHaveTextContent("無効");
    expect(row).not.toHaveTextContent("0時間");
  });

  it("keeps a real zero-capable setting numeric when it is not a switch", () => {
    // TC-UI-234 ★「無効」表記は 0 が無効を意味する設定にだけ効かせる。
    //   延長の上限回数 0 は「延長できない」という有効な設定であり、無効ではない。
    render(<SystemSettingsTable settings={settings({ max_report_extensions: 0 })} />);

    const row = screen.getByText("延長の上限回数").parentElement!;
    expect(row).toHaveTextContent("0回");
  });
});
