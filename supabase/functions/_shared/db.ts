// DB接続とトランザクション制御（04_BackendInterface.md 2.1 / ADR-016）。
// Supabase SDKは複数ステートメントにまたがるトランザクションを開始できないため、
// PostgreSQLへ Connection Pooler 経由で直接接続する。
import { Pool, type PoolClient } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

export type { PoolClient };

let dbPool: Pool | null = null;

// プールはimport時ではなく初回利用時に作る。
// トップレベルで作ると、環境変数の無いテスト環境ではimportしただけで壊れる。
// 接続先の解決（11_Deployment.md 5.1）。
//
// ★本番では APP_DB_POOL_URL を使う。SUPABASE_DB_URL ではない。
//   SUPABASE_DB_URL は Supabase が自動注入する既定値（直接接続）であり、
//   `SUPABASE_` は予約接頭辞のため `supabase secrets set` で上書きできない。
//   設計が要求する Connection Pooler（Supavisor / Transaction mode）へ向けるには、
//   予約されていない名前で別に与えるしかない。
//
// ★Pooler を挟まないと接続数が素の PostgreSQL の上限に張り付く。
//   下の lazy 指定の理由と同じ問題であり、あちらは緩和にすぎない。
//
// ローカルと CI は --env-file で SUPABASE_DB_URL を直接注入しており予約の制約を受けない。
// 未設定時にそちらへ退避するのは、両方の経路を壊さないためである。
function resolveDbUrl(): string {
  const pooled = Deno.env.get("APP_DB_POOL_URL");
  if (pooled) return pooled;

  const fallback = Deno.env.get("SUPABASE_DB_URL");
  if (fallback) return fallback;

  throw new Error("APP_DB_POOL_URL も SUPABASE_DB_URL も設定されていない");
}

export function getDbPool(): Pool {
  if (dbPool) return dbPool;
  const dbUrl = resolveDbUrl();
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
