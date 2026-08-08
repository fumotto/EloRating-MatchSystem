// Feature Hook（05_Frontend.md 8.1）。
import { useQuery } from "@tanstack/react-query";
import { matchClient } from "../../../services/matchClient";
import { queueKeys } from "../queryKeys";

export function useQueueStatus(teamId: string | undefined) {
  return useQuery({
    queryKey: queueKeys.status(teamId ?? ""),
    queryFn: () => matchClient.fetchQueueStatus(teamId as string),
    enabled: Boolean(teamId),
  });
}
