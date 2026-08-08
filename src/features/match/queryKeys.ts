// Query Key は Feature ごとに専用モジュールで定義する（05_Frontend.md 8.3）。
import type { MatchStatus } from "../../types/api";

export const matchKeys = {
  all: ["match"] as const,
  list: (filter: { status?: MatchStatus[] } = {}) => [...matchKeys.all, "list", filter] as const,
  detail: (matchId: string) => [...matchKeys.all, "detail", matchId] as const,
};

export const queueKeys = {
  all: ["queue"] as const,
  status: (teamId: string) => [...queueKeys.all, "status", teamId] as const,
};
