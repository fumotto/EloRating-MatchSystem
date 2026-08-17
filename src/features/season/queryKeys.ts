// Query Key（05_Frontend.md 8章）。
export const seasonKeys = {
  all: ["season"] as const,
  state: () => [...seasonKeys.all, "state"] as const,
  list: () => [...seasonKeys.all, "list"] as const,
  ranking: (n: number) => [...seasonKeys.all, "ranking", n] as const,
  members: (n: number, teamId: string) => [...seasonKeys.all, "members", n, teamId] as const,
};
