// Feature Hook（05_Frontend.md 8.1）。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { seasonClient } from "../../../services/seasonClient";
import { seasonKeys } from "../queryKeys";

export function useSeasonState() {
  return useQuery({
    queryKey: seasonKeys.state(),
    queryFn: () => seasonClient.fetchState(),
  });
}

export function useSeasonList() {
  return useQuery({
    queryKey: seasonKeys.list(),
    queryFn: () => seasonClient.fetchSeasons(),
  });
}

export function useSeasonRanking(seasonNumber: number | undefined) {
  return useQuery({
    queryKey: seasonKeys.ranking(seasonNumber ?? 0),
    queryFn: () => seasonClient.fetchRanking(seasonNumber as number),
    enabled: seasonNumber !== undefined,
  });
}

export function useSeasonMembers(seasonNumber: number | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: seasonKeys.members(seasonNumber ?? 0, teamId ?? ""),
    queryFn: () => seasonClient.fetchMembers(seasonNumber as number, teamId as string),
    enabled: seasonNumber !== undefined && Boolean(teamId),
  });
}

// 運用操作。いずれも状態が変わるため、状態と一覧を取り直す。
function useSeasonMutation<T>(fn: () => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: seasonKeys.all });
    },
  });
}

export function useEndSeason(disbandActiveTeams: boolean, disbandBannedTeams: boolean) {
  return useSeasonMutation(() =>
    seasonClient.endSeason({ disbandActiveTeams, disbandBannedTeams }),
  );
}

export function useCancelSeasonEnd() {
  return useSeasonMutation(() => seasonClient.cancelSeasonEnd());
}

export function usePurgeSeasonData() {
  return useSeasonMutation(() => seasonClient.purgeData());
}

export function useResumeSeason() {
  return useSeasonMutation(() => seasonClient.resumeSeason());
}
