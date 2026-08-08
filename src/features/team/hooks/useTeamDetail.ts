// Feature Hook（05_Frontend.md 8.1）。
import { useQuery } from "@tanstack/react-query";
import { teamClient } from "../../../services/teamClient";
import { teamKeys } from "../queryKeys";

export function useTeamDetail(teamId: string | undefined) {
  return useQuery({
    queryKey: teamKeys.detail(teamId ?? ""),
    queryFn: () => teamClient.fetchTeamDetail(teamId as string),
    enabled: Boolean(teamId),
  });
}
