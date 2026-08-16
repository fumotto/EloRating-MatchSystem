// Feature Hook（05_Frontend.md 8.1）。
//
// 試合確定後のレート変動を取る（Issue #6）。
// ★確定前・引き分けでは空配列が返る。これは異常ではない。
import { useQuery } from "@tanstack/react-query";
import { fetchMatchRatingResults } from "../../../services/matchClient";
import { matchKeys } from "../queryKeys";

export function useMatchRatingResults(matchId: string, enabled: boolean) {
  return useQuery({
    queryKey: matchKeys.ratingResults(matchId),
    queryFn: () => fetchMatchRatingResults(matchId),
    enabled: enabled && matchId.length > 0,
  });
}
