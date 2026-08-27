// 試合状態の表示文言（05_Frontend.md 14.1）。
//
// 状態値の正本は 03_Database.md 7.1 の4状態である。
// MATCHED・IN_PROGRESS は存在しない（ADR-008）。
import type { MatchStatus, NoContestReason, NoContestReasonCode } from "../../../types/api";

const LABELS: Record<MatchStatus, string> = {
  PLAYING: "進行中",
  WINNER_REPORTED: "承認待ち",
  COMPLETED: "確定",
  DRAWN: "引き分け",
};

export function matchStatusLabel(status: MatchStatus): string {
  return LABELS[status];
}

// DRAWN の理由ごとの説明（05_Frontend.md 14.7 / ADR-034 ①）。
//
// ★`DRAWN` を一律に「引き分け」と表示してはならない。帰結が異なる。
//   不利益の有無を利用者が読み取れないと、正直な確定が最速であることが伝わらない。
const NO_CONTEST_LABELS: Record<NoContestReason, string> = {
  REPORT_TIMEOUT: "期限までに申告がなかったため解散しました。両チームがしばらく待機になります。",
  NO_SHOW: "不成立の申請に応答がなかったため解散しました。応答しなかった側が待機になります。",
  CONFLICT:
    "双方が勝利を主張したまま期限を過ぎたため解散しました。レートは変わっていませんが、両チームがしばらく待機になります。",
  MUTUAL: "対戦不成立として合意しました。記録に影響せず、すぐ次の試合へ進めます。",
  ADMIN_VOID: "運営により無効となりました。不利益はありません。",
};

export function noContestLabel(reason: NoContestReason | null): string {
  if (reason === null) return "決着しませんでした。レートは変わっていません。";
  return NO_CONTEST_LABELS[reason];
}

// 不成立の申請理由（ADR-034 ②）。理由は結末を左右しない。相手の応答が決める。
const NO_CONTEST_REASON_LABELS: Record<NoContestReasonCode, string> = {
  CONNECTION: "回線が合わない",
  GAME_ISSUE: "ゲーム側の不具合・メンテナンス",
  NO_RESPONSE: "相手が現れない・応答しない",
  OTHER: "その他",
};

export function noContestReasonLabel(code: NoContestReasonCode): string {
  return NO_CONTEST_REASON_LABELS[code];
}

export const NO_CONTEST_REASON_CODES: NoContestReasonCode[] = [
  "CONNECTION",
  "GAME_ISSUE",
  "NO_RESPONSE",
  "OTHER",
];
