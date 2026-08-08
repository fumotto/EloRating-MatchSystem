// Edge Function の Integration Test で使うDBモック（00_DirectoryStructure.md 6章の tests/mocks/）。
//
// 各テストが `connect` / `queryObject` / `release` を手書きすると、
// BEGIN・COMMIT・ROLLBACK の扱いを取り違えても気付けない。ここへ集約する。

export interface ExecutedQuery {
  sql: string;
  params: unknown[];
}

// SQLの一部に一致したら、その結果行を返す。先に一致したものを採用する。
export type QueryStub = [match: string, rows: Record<string, unknown>[]];

export interface MockDb {
  pool: unknown;
  executed: ExecutedQuery[];
  // 発行されたSQLのうち、部分文字列に一致した最初のものを返す。
  find(match: string): ExecutedQuery | undefined;
  // 部分文字列に一致したSQLをすべて返す。
  findAll(match: string): ExecutedQuery[];
  committed(): boolean;
  rolledBack(): boolean;
}

// stubs に無いSQLは空行を返す。BEGIN/COMMIT/ROLLBACK もこれで吸収される。
// throwOn を渡すと、そのSQLに一致した時点で例外を投げる（ロールバック検証用）。
export function createMockDb(stubs: QueryStub[] = [], options: { throwOn?: string } = {}): MockDb {
  const executed: ExecutedQuery[] = [];

  const queryObject = (sql: string, params: unknown[] = []) => {
    executed.push({ sql, params });

    if (options.throwOn && sql.includes(options.throwOn)) {
      return Promise.reject(new Error(`mock failure on: ${options.throwOn}`));
    }

    for (const [match, rows] of stubs) {
      if (sql.includes(match)) return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
  };

  return {
    pool: { connect: () => Promise.resolve({ queryObject, release: () => {} }) },
    executed,
    find: (match) => executed.find((q) => q.sql.includes(match)),
    findAll: (match) => executed.filter((q) => q.sql.includes(match)),
    committed: () => executed.some((q) => q.sql === "COMMIT"),
    rolledBack: () => executed.some((q) => q.sql === "ROLLBACK"),
  };
}
