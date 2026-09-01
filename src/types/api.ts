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
  // 異なる対戦相手数（ADR-036 ③ / Migration 0024）。掲載の条件に使う。
  distinctOpponents: number;
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

// --- concede-match（21.1 / ADR-032 ①）---
//
// ★基本の経路である。承認を要さず即座に確定し、クールダウンを課さない。
// ★winnerTeamId を送らない。投了するのは自チームであり、勝者は一意に定まる。

export type ConcedeMatchRequest = {
  matchId: string;
  version: number;
};

export type ConcedeMatchResponse = ApproveMatchResponse;

// --- extend-match-deadline（21.4 / ADR-032 ⑦）---

export type ExtendMatchDeadlineRequest = {
  matchId: string;
  version: number;
};

export interface ExtendMatchDeadlineResponse {
  reportDeadlineAt: string;
  extensionCount: number;
  remainingExtensions: number;
  version: number;
}

// --- request-no-contest / respond-no-contest（21.5 / ADR-032 ⑧ ＋ ADR-034 ②）---

export type NoContestReasonCode = "CONNECTION" | "GAME_ISSUE" | "NO_RESPONSE" | "OTHER";

export type RequestNoContestRequest = {
  matchId: string;
  reasonCode: NoContestReasonCode;
  version: number;
};

export interface RequestNoContestResponse {
  requestedByTeamId: string;
  reasonCode: NoContestReasonCode;
  requestCount: number;
  version: number;
}

export type RespondNoContestRequest = {
  matchId: string;
  response: "ACCEPT" | "CONTINUE";
  version: number;
};

export interface RespondNoContestResponse {
  status: "DRAWN" | "PLAYING";
  noContestReason?: "MUTUAL";
  avoidanceRegistered?: boolean;
  version: number;
}

// --- 通報（20章 / ADR-033）---
//
// ★勝敗フローから完全に独立している。試合の状態にもレートにも影響しない。

export type AbuseReasonCode = "FALSE_REPORT" | "NO_SHOW" | "HARASSMENT" | "CHEATING" | "OTHER";

// ★reporterTeamId を送らない。所属チームはサーバがJWTから導出する。
//   送れてしまうと通報元チーム数を偽装でき、累積による判断が壊れる。
export type CreateAbuseReportRequest = {
  targetTeamId: string;
  reasonCode: AbuseReasonCode;
  detail: string;
  matchId?: string;
  evidenceUrls?: string[];
};

export interface CreateAbuseReportResponse {
  reportId: string;
  status: "OPEN";
  createdAt: string;
}

export type WithdrawAbuseReportRequest = { reportId: string };

export interface WithdrawAbuseReportResponse {
  status: "WITHDRAWN";
}

export type AbuseReportStatus =
  | "OPEN"
  | "NO_ACTION"
  | "WARNED"
  | "COOLDOWN"
  | "BANNED"
  | "WITHDRAWN";

export type AdminResolveAbuseReportRequest = {
  reportId: string;
  resolution: "NO_ACTION" | "WARNED" | "COOLDOWN" | "BANNED";
  note?: string;
  cooldownMinutes?: number;
};

export interface AdminResolveAbuseReportResponse {
  reportId: string;
  status: Exclude<AbuseReportStatus, "OPEN" | "WITHDRAWN">;
  resolvedAt: string;
}

export type AdminVoidMatchesRequest = {
  reason: string;
  matchId?: string;
  includeReported?: boolean;
};

export interface AdminVoidMatchesResponse {
  voidedCount: number;
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
  // シーズン終了の猶予（Issue #9 / Migration 0021）。
  seasonGraceMinutes?: number;
  // 表示設定（Issue #8 / Migration 0018）。
  siteTitle?: string;
  // public/ 配下の相対パス。空文字を送ると解除される。
  backgroundImagePath?: string;
  rulesMarkdown?: string;
  // お知らせ（Issue #7 / Migration 0019）。空文字なら帯を出さない。
  announcementText?: string;
  announcementLevel?: AnnouncementLevel;
  // 勝敗報告の確定方式（ADR-032 / ADR-034 / Migration 0023）。
  queueCooldownMinutes?: number;
  reportExtensionMinutes?: number;
  maxReportExtensions?: number;
  noShowMinutes?: number;
  noShowResponseMinutes?: number;
  maxNoContestRequests?: number;
  mutualNoContestDailyLimit?: number;
  avoidanceDays?: number;
  maxAvoidanceEntries?: number;
  // 保守による一時停止（ADR-034 ⑤）。シーズンの停止（matchmaking_paused）とは別物であり、
  // そちらは本APIから触れない（ADR-037 ②）。
  maintenancePaused?: boolean;
  // サブアカウント対策（ADR-036 / Migration 0024）。いずれも 0 で無効。
  rematchCooldownHours?: number;
  rankingMinOpponents?: number;
};

// public_settings ビューの列（Migration 0018）。未ログインでも取得できる。
// ★system_settings とは別物である。運用設定は含まない。
// 試合確定後のレート変動（Issue #6）。rating_history の1行に対応する。
export interface MatchRatingResult {
  teamId: string;
  beforeRating: number;
  afterRating: number;
  ratingChange: number;
  result: "WIN" | "LOSE";
}

// お知らせの深刻度（Issue #7 / Migration 0019）。
export type AnnouncementLevel = "INFO" | "WARN" | "ALERT";

export interface PublicSettings {
  site_title: string;
  background_image_path: string | null;
  rules_markdown: string;
  announcement_text: string;
  announcement_level: AnnouncementLevel;
}

// 列名は system_settings のもの（03_Database.md 10.8）。
export interface SystemSettings {
  site_title: string;
  background_image_path: string | null;
  rules_markdown: string;
  announcement_text: string;
  announcement_level: AnnouncementLevel;
  team_max_members: number;
  initial_rating: number;
  rating_k: number;
  match_rating_range: number;
  invite_expiration_hours: number;
  report_timeout_minutes: number;
  approve_timeout_minutes: number;
  // ★廃止した設定（ADR-032 ③）。値は誰も読まない。互換のために型へ残すが、
  //   画面へ出してはならない（ADR-037 ③）。
  max_reject_count: number;
  season_grace_minutes: number;
  // 勝敗報告の確定方式（ADR-032 / ADR-034 / Migration 0023）。
  queue_cooldown_minutes: number;
  report_extension_minutes: number;
  max_report_extensions: number;
  no_show_minutes: number;
  no_show_response_minutes: number;
  max_no_contest_requests: number;
  mutual_no_contest_daily_limit: number;
  avoidance_days: number;
  max_avoidance_entries: number;
  maintenance_paused: boolean;
  // サブアカウント対策（ADR-036 / Migration 0024）。
  rematch_cooldown_hours: number;
  ranking_min_opponents: number;
}

export interface UpdateSystemSettingsResponse {
  settings: SystemSettings;
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

// DRAWN の理由（ADR-034 ①）。
//
// ★`DRAWN` を一律に「引き分け」として扱ってはならない。帰結が異なる。
//   REPORT_TIMEOUT / CONFLICT … 両チームが不戦とクールダウンを負う
//   NO_SHOW                  … 無応答側のみ
//   MUTUAL / ADMIN_VOID      … 不利益なし。確定率にも計上しない
//   SEASON_END               … 同上（ADR-038 ②）。シーズン終了による打ち切り
export type NoContestReason =
  | "REPORT_TIMEOUT"
  | "NO_SHOW"
  | "MUTUAL"
  | "CONFLICT"
  | "ADMIN_VOID"
  | "SEASON_END";

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
  noContestReason: NoContestReason | null;
  autoApproved: boolean;
}

export interface MatchDetail extends MatchListEntry {
  reportedById: string | null;
  reportedByName: string | null;
  reportedAt: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectCount: number;
  reportDeadlineAt: string;
  approveDeadlineAt: string | null;
  // 反対申告（ADR-032 ⑩）。設定されている間は自動承認が止まる。
  counterClaimTeamId: string | null;
  counterClaimedAt: string | null;
  reportExtensionCount: number;
  // 保留中の不成立申請（ADR-032 ⑧）。
  noContestRequestedByTeamId: string | null;
  noContestRequestedAt: string | null;
  noContestReasonCode: NoContestReasonCode | null;
  noContestRequestCount: number;
  // 楽観ロック値。更新系はこれを送る（05_Frontend.md 9章）。
  version: number;
}

// 通報の一覧（管理画面と自分の通報）。
export interface AbuseReportEntry {
  id: string;
  targetTeamId: string;
  reporterTeamId: string | null;
  matchId: string | null;
  reasonCode: AbuseReasonCode;
  detail: string;
  evidenceUrls: string[];
  status: AbuseReportStatus;
  createdAt: string;
}

// 通報の累積（ADR-033 ④）。
//
// ★reporterTeamCount（m）が判断の主材料である。reportCount（n）は
//   1チームから何度でも増やせるため、単独では信号にならない。
export interface AbuseReportAggregate {
  targetTeamId: string;
  reportCount: number;
  reporterTeamCount: number;
  sanctionCount: number;
  lastReportedAt: string;
}

// --- 疑わしいペア（ADR-036 ④ / suspicious_pair_view）---
//
// ★これは疑いであって証拠ではない。自動の措置は一切結び付けない。管理者が読む材料である。
export interface SuspiciousPair {
  teamLowId: string;
  teamHighId: string;
  matchCount: number;
  lowWins: number;
  highWins: number;
  concedeCount: number;
  avgSettleMinutes: number | null;
  lastCompletedAt: string;
  // 0.5 が互角、1.0 は一度も逆向きの結果が出ていない。
  oneSidedRatio: number;
  // 両チームが同じ時刻に別々の試合へ出たことが一度も無い。
  neverConcurrent: boolean;
}

// --- チーム単位の偏り（ADR-036 ④ / team_integrity_view）---
export interface TeamIntegrity {
  teamId: string;
  settledMatches: number;
  distinctOpponents: number;
  gainedTotal: number;
  topOpponentId: string;
  topOpponentMatches: number;
  topOpponentGained: number;
  // 1.0 に近いほど、稼ぎが単一の相手から来ている。
  topOpponentGainShare: number | null;
}

// --- admin-create-match（12.11 / ADR-035 ⑤ / ADR-039）---
//
// ★待機列を経由しない試合の生成である。レート差・再マッチ抑止・クールダウンには
//   拘束されない。1チームへ複数の試合を同時に割り当てられる。
export type AdminCreateMatchRequest = {
  [key: string]: unknown;
  teamAId: string;
  teamBId: string;
};

export interface AdminCreateMatchResponse {
  matchId: string;
  teamAId: string;
  teamBId: string;
  reportDeadlineAt: string;
}

// 対戦カードを組むための候補。人数を出すのは、管理者が不揃いに気付けるようにするためである
// （ADR-039 ④）。必須人数は要求しないため、画面が唯一の手がかりになる。
export interface MatchCandidateTeam {
  teamId: string;
  teamName: string;
  rating: number;
  isBanned: boolean;
  memberCount: number;
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
