// 試合状態の表示文言（05_Frontend.md 14.1）。
//
// 状態値の正本は 03_Database.md 7.1 の4状態である。
// MATCHED・IN_PROGRESS は存在しない（ADR-008）。
import type { MatchStatus } from "../../../types/api";

const LABELS: Record<MatchStatus, string> = {
  PLAYING: "進行中",
  WINNER_REPORTED: "承認待ち",
  COMPLETED: "確定",
  DRAWN: "引き分け",
};

export function matchStatusLabel(status: MatchStatus): string {
  return LABELS[status];
}
