// Backend Client（05_Frontend.md 3章）。UI・状態を持たない。
import { invoke } from "./invoke";
import { supabase } from "../lib/supabase";
import type { CreateTeamRequest, CreateTeamResponse, TeamSummary } from "../types/api";

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
};
