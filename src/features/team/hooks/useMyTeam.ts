// Feature Hook（05_Frontend.md 8.1）。
import { useQuery } from "@tanstack/react-query";
import { teamClient } from "../../../services/teamClient";
import { teamKeys } from "../queryKeys";

export function useMyTeam(profileId: string | undefined) {
  return useQuery({
    queryKey: teamKeys.my(),
    queryFn: () => teamClient.fetchMyTeam(profileId as string),
    enabled: Boolean(profileId),
  });
}
