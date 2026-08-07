// Backend Interface の DTO（04_BackendInterface.md 5章・6章・9章）。
// ★フロント独自のDTOを作成してはならない（05_Frontend.md 15章）。
//   型名は 04_BackendInterface.md の定義をそのまま使う。

export type ApiResult = "OK" | "NG" | "FATAL";

export interface ApiError {
  code: string;
  message: string;
}

// 共通レスポンス封筒。成功時は data、失敗時は error が入る。
export interface ApiResponse<T> {
  result: ApiResult;
  data?: T;
  error?: ApiError;
}

// --- 共通DTO（04_BackendInterface.md 6章）---

export interface TeamSummary {
  id: string;
  name: string;
  rating: number;
}

export interface ProfileSummary {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

// --- ensure-profile（9.1）---

// ★リクエストDTOは interface ではなく type で定義する。
//   interface には暗黙の index signature が付かず、Edge Function 呼び出しの
//   body（Record<string, unknown>）へ渡せないため。
export type EnsureProfileRequest = {
  displayName: string;
  avatarUrl?: string;
};

export interface EnsureProfileResponse {
  id: string;
  displayName: string;
  avatarUrl?: string;
  authProvider: string;
}

// --- create-team（9.2）---

export type CreateTeamRequest = {
  name: string;
};

export interface CreateTeamResponse {
  teamId: string;
  name: string;
  rating: number;
}

// --- Ranking Query（team_ranking_view / 03_Database.md 11.1）---
// 読み取りは PostgREST 経由の Query である（04_BackendInterface.md 2章）。

export interface RankingEntry {
  teamId: string;
  teamName: string;
  rating: number;
  rank: number;
  wins: number;
  losses: number;
  matches: number;
  winRate: number | null;
}
