// Feature Hook（05_Frontend.md 8.1）。
//
// 楽観ロックの version はここから得る（9章）。MATCH-008 を受けたら再取得する。
import { useQuery } from "@tanstack/react-query";
import { matchClient } from "../../../services/matchClient";
import { matchKeys } from "../queryKeys";

export function useMatchDetail(matchId: string | undefined) {
  return useQuery({
    queryKey: matchKeys.detail(matchId ?? ""),
    queryFn: () => matchClient.fetchMatchDetail(matchId as string),
    enabled: Boolean(matchId),
  });
}
