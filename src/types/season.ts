// シーズン（Issue #9）。DTOは camelCase、DBカラムは snake_case である（04 6.1）。

export type SeasonStatus = "ACTIVE" | "ENDING" | "FINALIZED";

export interface SeasonOperationState {
  currentSeason: number;
  status: SeasonStatus;
  graceUntil: string | null;
  matchmakingPaused: boolean;
  updatesLocked: boolean;
  // 保守による一時停止（ADR-034 ⑤）。シーズンの停止とは別の列である。
  // ★シーズンを再開しても解除されない。両方を見ないと、マッチングが受け付けられるか判定できない。
  maintenancePaused: boolean;
}

export interface SeasonSummary {
  number: number;
  startedAt: string;
  endedAt: string | null;
}

export interface SeasonRankingEntry {
  seasonNumber: number;
  teamId: string;
  teamName: string;
  rating: number;
  rank: number;
  wins: number;
  losses: number;
  matches: number;
  winRate: number | null;
  isBanned: boolean;
}

export interface SeasonMemberEntry {
  teamId: string;
  profileId: string;
  displayName: string;
  role: "LEADER" | "MEMBER";
}

export interface EndSeasonRequest {
  [key: string]: unknown;
  disbandActiveTeams?: boolean;
  disbandBannedTeams?: boolean;
}

export interface EndSeasonResponse {
  season: number;
  graceUntil: string;
  activeMatches: number;
}

export interface ExportSeasonDataRequest {
  [key: string]: unknown;
  kind: "MATCHES" | "LOGS";
}

export interface ExportSeasonDataResponse {
  season: number;
  kind: "MATCHES" | "LOGS";
  rowCount: number;
  rows: Record<string, unknown>[];
}

export interface PurgeSeasonDataResponse {
  season: number;
  deletedMatches: number;
  deletedRatingHistory: number;
  deletedLogs: number;
  disbandedTeams: number;
}

export interface ResumeSeasonResponse {
  season: number;
}
