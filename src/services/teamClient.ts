// Backend Client（05_Frontend.md 3章）。UI・状態を持たない。
import { invoke } from "./invoke";
import { supabase } from "../lib/supabase";
import type {
  AcceptTeamInviteRequest,
  AcceptTeamInviteResponse,
  CreateTeamInviteRequest,
  CreateTeamInviteResponse,
  CreateTeamRequest,
  CreateTeamResponse,
  LeaveTeamRequest,
  LeaveTeamResponse,
  TeamDetail,
  TeamMemberEntry,
  TeamSummary,
  TransferLeaderRequest,
  TransferLeaderResponse,
} from "../types/api";

// team_detail_view の行。View の列はスネークケースである。
interface TeamDetailRow {
  team_id: string;
  team_name: string;
  rating: number;
  is_banned: boolean;
  leader_id: string | null;
  member_count: number;
  members: TeamMemberEntry[];
}

export const teamClient = {
  // 更新系は Edge Function（04_BackendInterface.md 2章）。
  createTeam(request: CreateTeamRequest): Promise<CreateTeamResponse> {
    return invoke<CreateTeamRequest, CreateTeamResponse>("create-team", request);
  },

  // 読み取りは Query（RLSで保護される）。未所属なら null。
  async fetchMyTeam(profileId: string): Promise<TeamSummary | null> {
    const { data, error } = await supabase
      .from("team_members")
      .select("teams(id, name, rating)")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    // 埋め込み選択の戻りは、リレーションの解釈により単体にも配列にもなる。両方を受ける。
    const row = data as unknown as { teams: TeamSummary | TeamSummary[] | null };
    if (Array.isArray(row.teams)) return row.teams[0] ?? null;
    return row.teams ?? null;
  },

  createInvite(request: CreateTeamInviteRequest): Promise<CreateTeamInviteResponse> {
    return invoke<CreateTeamInviteRequest, CreateTeamInviteResponse>("create-team-invite", request);
  },

  acceptInvite(request: AcceptTeamInviteRequest): Promise<AcceptTeamInviteResponse> {
    return invoke<AcceptTeamInviteRequest, AcceptTeamInviteResponse>("accept-team-invite", request);
  },

  // 所属チームはJWTから導出されるため、入力は空である（04 9.5）。
  leaveTeam(): Promise<LeaveTeamResponse> {
    return invoke<LeaveTeamRequest, LeaveTeamResponse>("leave-team", {} as LeaveTeamRequest);
  },

  transferLeader(request: TransferLeaderRequest): Promise<TransferLeaderResponse> {
    return invoke<TransferLeaderRequest, TransferLeaderResponse>("transfer-leader", request);
  },

  // team_detail_view は認証済み限定である（03_Database.md 15章）。
  async fetchTeamDetail(teamId: string): Promise<TeamDetail | null> {
    const { data, error } = await supabase
      .from("team_detail_view")
      .select("*")
      .eq("team_id", teamId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as TeamDetailRow;
    return {
      teamId: row.team_id,
      teamName: row.team_name,
      rating: row.rating,
      isBanned: row.is_banned,
      leaderId: row.leader_id,
      memberCount: row.member_count,
      members: row.members,
    };
  },
};
