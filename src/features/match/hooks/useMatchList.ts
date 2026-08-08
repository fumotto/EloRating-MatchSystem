// Feature Hook（05_Frontend.md 8.1）。
import { useQuery } from "@tanstack/react-query";
import { matchClient } from "../../../services/matchClient";
import { matchKeys } from "../queryKeys";
import type { MatchStatus } from "../../../types/api";

export function useMatchList(filter: { status?: MatchStatus[] } = {}) {
  return useQuery({
    queryKey: matchKeys.list(filter),
    queryFn: () => matchClient.fetchMatchList(filter),
  });
}
