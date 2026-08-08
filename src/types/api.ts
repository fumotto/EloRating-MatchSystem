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

// --- create-team-invite（9.3）---

export type CreateTeamInviteRequest = {
  teamId: string;
};

export interface CreateTeamInviteResponse {
  inviteCode: string;
  expiresAt: string;
}

// --- accept-team-invite（9.4）---

export type AcceptTeamInviteRequest = {
  inviteCode: string;
};

export interface AcceptTeamInviteResponse {
  teamId: string;
  teamName: string;
}

// --- leave-team（9.5）---

// 所属チームはJWTから導出するため入力は無い。
export type LeaveTeamRequest = Record<string, never>;

export interface LeaveTeamResponse {
  teamId: string;
  remainingMembers: number;
}

// --- transfer-leader（9.6）---

export type TransferLeaderRequest = {
  newLeaderProfileId: string;
};

export interface TransferLeaderResponse {
  leaderId: string;
}

// --- queue-match（10.1）---

export type QueueMatchRequest = {
  teamId: string;
};

export interface QueueMatchResponse {
  queuedAt: string;
  matched: boolean;
  matchId?: string;
}

// --- cancel-match-queue（10.2）---

export type CancelMatchQueueRequest = {
  teamId: string;
};

export interface CancelMatchQueueResponse {
  teamId: string;
}

// --- report-match（10.3）---

export type ReportMatchRequest = {
  matchId: string;
  winnerTeamId: string;
  version: number;
};

export interface ReportMatchResponse {
  status: "WINNER_REPORTED";
  approveDeadlineAt: string;
  version: number;
}

// --- approve-match（10.4）---

export type ApproveMatchRequest = {
  matchId: string;
  version: number;
};

export interface ApproveMatchResponse {
  completedAt: string;
  winnerTeamId: string;
  ratings: {
    teamId: string;
    beforeRating: number;
    afterRating: number;
    ratingChange: number;
  }[];
}

// --- reject-match（10.5）---

export type RejectMatchRequest = {
  matchId: string;
  version: number;
};

export interface RejectMatchResponse {
  status: "PLAYING" | "DRAWN";
  rejectCount: number;
  reportDeadlineAt?: string;
}

// --- Admin（12章）---

export type AdminBanTeamRequest = {
  teamId: string;
  reason: string;
};

export interface AdminBanTeamResponse {
  teamId: string;
  isBanned: true;
}

export type AdminUnbanTeamRequest = {
  teamId: string;
};

export interface AdminUnbanTeamResponse {
  teamId: string;
  isBanned: false;
}

export type UpdateSystemSettingsRequest = {
  teamMaxMembers?: number;
  initialRating?: number;
  ratingK?: number;
  matchRatingRange?: number;
  inviteExpirationHours?: number;
  reportTimeoutMinutes?: number;
  approveTimeoutMinutes?: number;
  maxRejectCount?: number;
};

// 列名は system_settings のもの（03_Database.md 10.8）。
export interface SystemSettings {
  team_max_members: number;
  initial_rating: number;
  rating_k: number;
  match_rating_range: number;
  invite_expiration_hours: number;
  report_timeout_minutes: number;
  approve_timeout_minutes: number;
  max_reject_count: number;
}

export interface UpdateSystemSettingsResponse {
  settings: SystemSettings;
}

export type AdminResetRatingsRequest = {
  initialRating?: number;
};

export interface AdminResetRatingsResponse {
  affectedTeams: number;
  initialRating: number;
}

// --- Query（13章）。View の列はスネークケースのまま扱う ---

export type MatchStatus = "PLAYING" | "WINNER_REPORTED" | "COMPLETED" | "DRAWN";

export type TeamRole = "LEADER" | "MEMBER";

export interface TeamMemberEntry {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role: TeamRole;
}

export interface TeamDetail {
  teamId: string;
  teamName: string;
  rating: number;
  isBanned: boolean;
  leaderId: string | null;
  memberCount: number;
  members: TeamMemberEntry[];
}

export interface MatchListEntry {
  id: string;
  teamAId: string;
  teamAName: string;
  teamARating: number;
  teamBId: string;
  teamBName: string;
  teamBRating: number;
  winnerTeamId: string | null;
  status: MatchStatus;
  startedAt: string;
  completedAt: string | null;
}

export interface MatchDetail extends MatchListEntry {
  reportedById: string | null;
  reportedByName: string | null;
  reportedAt: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  autoApproved: boolean;
  rejectCount: number;
  reportDeadlineAt: string;
  approveDeadlineAt: string | null;
  // 楽観ロック値。更新系はこれを送る（05_Frontend.md 9章）。
  version: number;
}

export interface QueueStatus {
  teamId: string;
  queuedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorProfileId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}
