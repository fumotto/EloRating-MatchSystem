// アイコン表示。
//
// ★配信元の限定が要点である。任意のURLを <img src> に載せると、
//   画面を開いただけで閲覧者のIPとUAが指定先へ渡る。
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "./Avatar";

const DISCORD = "https://cdn.discordapp.com/avatars/123/abc.png";

describe("Avatar", () => {
  it("renders the image for a provider CDN url", () => {
    // TC-UI-109
    render(<Avatar src={DISCORD} name="PLAYER_A1" />);
    expect(screen.getByRole("presentation")).toHaveAttribute("src", DISCORD);
  });

  it("does not leak the page url to the image host", () => {
    // TC-UI-110
    render(<Avatar src={DISCORD} name="PLAYER_A1" />);
    expect(screen.getByRole("presentation")).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("falls back to the initial when there is no image", () => {
    // TC-UI-111
    render(<Avatar src={undefined} name="PLAYER_A1" />);
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("refuses a url outside the allowlist", () => {
    // TC-UI-112
    // ★avatar_url は利用者が値を決められる（03_Database.md 19章）。
    render(<Avatar src="https://evil.example.com/track.png" name="PLAYER_A1" />);
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("refuses a host that merely starts with the allowed name", () => {
    // TC-UI-113
    render(<Avatar src="https://cdn.discordapp.com.evil.example/a.png" name="PLAYER_A1" />);
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("refuses credentials embedded in the url", () => {
    // TC-UI-114
    render(<Avatar src="https://x@cdn.discordapp.com/avatars/1/a.png" name="PLAYER_A1" />);
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("refuses a non-https url", () => {
    // TC-UI-115
    render(<Avatar src="http://cdn.discordapp.com/avatars/1/a.png" name="PLAYER_A1" />);
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });
});
