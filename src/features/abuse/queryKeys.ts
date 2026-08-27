export const abuseKeys = {
  all: ["abuse"] as const,
  reports: (openOnly: boolean) => ["abuse", "reports", openOnly] as const,
  aggregates: () => ["abuse", "aggregates"] as const,
};
