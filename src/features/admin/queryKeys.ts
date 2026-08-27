// Query Key は Feature ごとに専用モジュールで定義する（05_Frontend.md 8.3）。
export const auditKeys = {
  all: ["audit"] as const,
  list: () => [...auditKeys.all, "list"] as const,
};

// サブアカウント対策の信号（ADR-036 ④）。
export const integrityKeys = {
  all: ["integrity"] as const,
  pairs: () => [...integrityKeys.all, "pairs"] as const,
  teams: () => [...integrityKeys.all, "teams"] as const,
};

// 対戦カードの候補（ADR-039）。
export const matchCandidateKeys = {
  all: ["matchCandidates"] as const,
  list: () => [...matchCandidateKeys.all, "list"] as const,
};
