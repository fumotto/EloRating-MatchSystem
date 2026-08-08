// Query Key は Feature ごとに専用モジュールで定義する（05_Frontend.md 8.3）。
export const auditKeys = {
  all: ["audit"] as const,
  list: () => [...auditKeys.all, "list"] as const,
};
