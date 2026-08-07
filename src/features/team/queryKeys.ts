// Query Key は Feature ごとに専用モジュールで定義する（05_Frontend.md 8.3）。
export const teamKeys = {
  all: ["team"] as const,
  my: () => [...teamKeys.all, "my"] as const,
};
