// Backend Client（05_Frontend.md 3章）。
//
// ランキングは未認証でも閲覧できる（ADR-018）。team_ranking_view は定義者権限で動くため、
// anon キーのままでも勝敗数が 0 にならない（0011_views.sql の注記を参照）。
import { supabase } from "../lib/supabase";
import type { RankingEntry } from "../types/api";

// View の列はスネークケース。DTO はキャメルケースへ変換して返す。
interface RankingRow {
  team_id: string;
  team_name: string;
  rating: number;
  rank: number;
  wins: number;
  losses: number;
  matches: number;
  win_rate: number | null;
}

export const rankingClient = {
  async fetchRanking(limit = 50, offset = 0): Promise<RankingEntry[]> {
    const { data, error } = await supabase
      .from("team_ranking_view")
      .select("*")
      .order("rank", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return (data as RankingRow[]).map((row) => ({
      teamId: row.team_id,
      teamName: row.team_name,
      rating: row.rating,
      rank: row.rank,
      wins: row.wins,
      losses: row.losses,
      matches: row.matches,
      winRate: row.win_rate,
    }));
  },
};
