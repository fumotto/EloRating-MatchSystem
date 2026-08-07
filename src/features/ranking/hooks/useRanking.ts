// Feature Hook（TanStack Query / 05_Frontend.md 3章・8.1）。
// サーバーデータは TanStack Query が持つ。Zustand へ入れてはならない（ADR-011）。
import { useQuery } from "@tanstack/react-query";
import { rankingClient } from "../../../services/rankingClient";
import { rankingKeys } from "../queryKeys";

export function useRanking() {
  return useQuery({
    queryKey: rankingKeys.list(),
    queryFn: () => rankingClient.fetchRanking(),
  });
}
