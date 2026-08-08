// Query Key は Feature ごとに専用モジュールで定義する（05_Frontend.md 8.3）。
export const settingsKeys = {
  all: ["settings"] as const,
  current: () => [...settingsKeys.all, "current"] as const,
};
