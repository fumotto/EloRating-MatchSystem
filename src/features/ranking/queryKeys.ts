// Query Key は Feature ごとに専用モジュールで定義する（05_Frontend.md 8.3）。
// ★文字列を直接記述してはならない。
export const rankingKeys = {
  all: ["ranking"] as const,
  list: () => [...rankingKeys.all, "list"] as const,
};
