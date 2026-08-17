// Backend Client（05_Frontend.md 3章）。UI・状態を持たない。
import { invoke } from "./invoke";
import { supabase } from "../lib/supabase";
import type {
  EndSeasonRequest,
  EndSeasonResponse,
  ExportSeasonDataRequest,
  ExportSeasonDataResponse,
  PurgeSeasonDataResponse,
  ResumeSeasonResponse,
  SeasonMemberEntry,
  SeasonOperationState,
  SeasonRankingEntry,
  SeasonSummary,
} from "../types/season";

export const seasonClient = {
  // 運用状態。管理画面と、利用者への案内表示の双方で使う。
  async fetchState(): Promise<SeasonOperationState | null> {
    const { data: settings, error } = await supabase
      .from("public_settings")
      .select("current_season, matchmaking_paused, updates_locked")
      .maybeSingle();

    if (error) throw error;
    if (!settings) return null;

    const row = settings as {
      current_season: number;
      matchmaking_paused: boolean;
      updates_locked: boolean;
    };

    const { data: season, error: seasonError } = await supabase
      .from("seasons")
      .select("status, grace_until")
      .eq("number", row.current_season)
      .maybeSingle();

    if (seasonError) throw seasonError;

    const s = season as {
      status: SeasonOperationState["status"];
      grace_until: string | null;
    } | null;

    return {
      currentSeason: row.current_season,
      status: s?.status ?? "ACTIVE",
      graceUntil: s?.grace_until ?? null,
      matchmakingPaused: row.matchmaking_paused,
      updatesLocked: row.updates_locked,
    };
  },

  async fetchSeasons(): Promise<SeasonSummary[]> {
    const { data, error } = await supabase
      .from("season_list_view")
      .select("number, started_at, ended_at")
      .order("number", { ascending: false });

    if (error) throw error;

    return (data ?? []).map((r) => {
      const row = r as { number: number; started_at: string; ended_at: string | null };
      return { number: row.number, startedAt: row.started_at, endedAt: row.ended_at };
    });
  },

  async fetchRanking(seasonNumber: number): Promise<SeasonRankingEntry[]> {
    const { data, error } = await supabase
      .from("season_ranking_view")
      .select("*")
      .eq("season_number", seasonNumber)
      .order("rank", { ascending: true });

    if (error) throw error;

    return (data ?? []).map((r) => {
      const row = r as Record<string, never>;
      return {
        seasonNumber: row.season_number,
        teamId: row.team_id,
        teamName: row.team_name,
        rating: row.rating,
        rank: row.rank,
        wins: row.wins,
        losses: row.losses,
        matches: row.matches,
        winRate: row.win_rate,
        isBanned: row.is_banned,
      };
    });
  },

  async fetchMembers(seasonNumber: number, teamId: string): Promise<SeasonMemberEntry[]> {
    const { data, error } = await supabase
      .from("season_member_view")
      .select("team_id, profile_id, display_name, role")
      .eq("season_number", seasonNumber)
      .eq("team_id", teamId);

    if (error) throw error;

    return (data ?? []).map((r) => {
      const row = r as {
        team_id: string;
        profile_id: string;
        display_name: string;
        role: "LEADER" | "MEMBER";
      };
      return {
        teamId: row.team_id,
        profileId: row.profile_id,
        displayName: row.display_name,
        role: row.role,
      };
    });
  },

  endSeason(request: EndSeasonRequest): Promise<EndSeasonResponse> {
    return invoke<EndSeasonRequest, EndSeasonResponse>("admin-end-season", request);
  },

  exportData(request: ExportSeasonDataRequest): Promise<ExportSeasonDataResponse> {
    return invoke<ExportSeasonDataRequest, ExportSeasonDataResponse>(
      "admin-export-season-data",
      request,
    );
  },

  purgeData(): Promise<PurgeSeasonDataResponse> {
    return invoke<Record<string, never>, PurgeSeasonDataResponse>(
      "admin-purge-season-data",
      {} as Record<string, never>,
    );
  },

  cancelSeasonEnd(): Promise<ResumeSeasonResponse> {
    return invoke<Record<string, never>, ResumeSeasonResponse>(
      "admin-cancel-season-end",
      {} as Record<string, never>,
    );
  },

  resumeSeason(): Promise<ResumeSeasonResponse> {
    return invoke<Record<string, never>, ResumeSeasonResponse>(
      "admin-resume-season",
      {} as Record<string, never>,
    );
  },
};
