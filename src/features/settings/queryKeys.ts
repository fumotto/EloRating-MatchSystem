// Query Key は Feature ごとに専用モジュールで定義する（05_Frontend.md 8.3）。
export const settingsKeys = {
  all: ["settings"] as const,
  current: () => [...settingsKeys.all, "current"] as const,
  // 公開表示設定（Issue #8）。未ログインでも取得するため別キーにする。
  public: () => [...settingsKeys.all, "public"] as const,
};
