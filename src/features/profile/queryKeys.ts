// Query Key は Feature ごとに専用モジュールで定義する（05_Frontend.md 8.3）。
export const profileKeys = {
  all: ["profile"] as const,
  me: () => [...profileKeys.all, "me"] as const,
};
