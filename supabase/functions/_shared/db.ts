// DB接続とトランザクション制御（04_BackendInterface.md 2.1 / ADR-016）。
// Supabase SDKは複数ステートメントにまたがるトランザクションを開始できないため、
// PostgreSQLへ Connection Pooler 経由で直接接続する。
import { Pool, type PoolClient } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

export type { PoolClient };

let dbPool: Pool | null = null;

// プールはimport時ではなく初回利用時に作る。
// トップレベルで作ると、環境変数の無いテスト環境ではimportしただけで壊れる。
export function getDbPool(): Pool {
  if (dbPool) return dbPool;
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is not set");
  // ★第3引数の lazy を true にする。既定（false）では生成時に10本すべて接続を張る。
  //   Function ごとに別プロセスで動くため、複数のFunctionが呼ばれるだけで接続数が積み上がり、
  //   PostgreSQL の上限に達して Auth（GoTrue）まで "Database error" で落ちる。
  //   実際にCIのE2Eで発生した。必要になったときだけ張る。
  dbPool = new Pool(dbUrl, 10, true);
  return dbPool;
}

// テストからモックプールを注入するための差し替え口。
export function setDbPool(pool: Pool) {
  dbPool = pool;
}

export function resetDbPool() {
  dbPool = null;
}

// ★SQLの発行は queryObject を使う。
//   deno-postgres v0.19.3 の PoolClient に query() は存在せず、
//   queryObject / queryArray のみである。設計書 2.1 の tx.query(...) は概念コードで実APIではない。
//   ここを query() のままにすると、テスト側のモック（queryObject を持つ）と噛み合わず
//   BEGIN の時点で TypeError になる。
//   tx を any にすると呼び出し側の queryObject<T>() が TS2347 になる。PoolClient で型付けする（B-014）。
export async function withTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const pool = getDbPool();
  const tx = await pool.connect();
  try {
    await tx.queryObject("BEGIN");
    const result = await fn(tx);
    await tx.queryObject("COMMIT");
    return result;
  } catch (e) {
    await tx.queryObject("ROLLBACK");
    throw e;
  } finally {
    tx.release();
  }
}
