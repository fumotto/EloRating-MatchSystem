import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  getDbPool,
  setDbPool,
  resetDbPool,
  withTransaction,
} from "../../supabase/functions/_shared/db.ts";

// _shared/db.ts は deno-postgres（https://deno.land/x/postgres）を import するため Deno でのみ実行できる。

// モックは deno-postgres の PoolClient に合わせ、query ではなく queryObject を持たせる。
class MockTransaction {
  calls: string[] = [];
  released = false;

  queryObject(sql: string): Promise<void> {
    this.calls.push(sql);
    return Promise.resolve();
  }

  release(): void {
    this.released = true;
  }
}

class MockPool {
  constructor(private readonly tx: MockTransaction) {}

  connect(): MockTransaction {
    return this.tx;
  }
}

describe("_shared/db", () => {
  it("returns the pool injected through setDbPool", () => {
    // TC-INFRA-005
    const mockPool = new MockPool(new MockTransaction());
    setDbPool(mockPool as never);
    try {
      assertEquals(getDbPool(), mockPool as never);
    } finally {
      resetDbPool();
    }
  });

  it("issues BEGIN and COMMIT and releases the client on success", async () => {
    // TC-INFRA-006
    const mockTx = new MockTransaction();
    setDbPool(new MockPool(mockTx) as never);
    try {
      const result = await withTransaction(() => Promise.resolve("success"));

      assertEquals(result, "success");
      assertEquals(mockTx.calls, ["BEGIN", "COMMIT"]);
      assertEquals(mockTx.released, true);
    } finally {
      resetDbPool();
    }
  });

  it("issues ROLLBACK, propagates the error and releases the client on failure", async () => {
    // TC-INFRA-007
    const mockTx = new MockTransaction();
    setDbPool(new MockPool(mockTx) as never);
    try {
      await assertRejects(
        () =>
          withTransaction(() => {
            throw new Error("業務エラー");
          }),
        Error,
        "業務エラー",
      );

      assertEquals(mockTx.calls, ["BEGIN", "ROLLBACK"]);
      assertEquals(mockTx.released, true);
    } finally {
      resetDbPool();
    }
  });

  it("passes a transaction handle that can run queryObject", async () => {
    // TC-INFRA-008
    const mockTx = new MockTransaction();
    setDbPool(new MockPool(mockTx) as never);
    try {
      await withTransaction(async (tx) => {
        await tx.queryObject("SELECT 1");
      });

      assertEquals(mockTx.calls, ["BEGIN", "SELECT 1", "COMMIT"]);
    } finally {
      resetDbPool();
    }
  });
});

// 接続先の解決（11_Deployment.md 5.1）。
//
// 本番は APP_DB_POOL_URL（Pooler）を使う。SUPABASE_DB_URL は Supabase が自動注入する
// 直接接続であり、予約接頭辞のため上書きできない。
// ローカルと CI は --env-file で SUPABASE_DB_URL を注入するため、退避経路を壊してはならない。
describe("_shared/db connection url", () => {
  const POOLED = "postgresql://postgres.ref:pw@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
  const DIRECT = "postgresql://postgres:pw@db.ref.supabase.co:5432/postgres";

  // 環境変数はプロセス全体で共有される。テストごとに元へ戻す。
  function withEnv(values: Record<string, string | undefined>, fn: () => void) {
    const saved: Record<string, string | undefined> = {};
    for (const key of Object.keys(values)) {
      saved[key] = Deno.env.get(key);
      const next = values[key];
      if (next === undefined) Deno.env.delete(key);
      else Deno.env.set(key, next);
    }
    try {
      fn();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) Deno.env.delete(key);
        else Deno.env.set(key, value);
      }
      resetDbPool();
    }
  }

  it("builds a pool from APP_DB_POOL_URL when it is set", () => {
    withEnv({ APP_DB_POOL_URL: POOLED, SUPABASE_DB_URL: DIRECT }, () => {
      resetDbPool();
      assertEquals(typeof getDbPool(), "object");
    });
  });

  it("falls back to SUPABASE_DB_URL when APP_DB_POOL_URL is absent", () => {
    // ★この経路が CI とローカルを支えている。落とすと全 Integration / E2E が壊れる。
    withEnv({ APP_DB_POOL_URL: undefined, SUPABASE_DB_URL: DIRECT }, () => {
      resetDbPool();
      assertEquals(typeof getDbPool(), "object");
    });
  });

  it("throws when neither is set", () => {
    withEnv({ APP_DB_POOL_URL: undefined, SUPABASE_DB_URL: undefined }, () => {
      resetDbPool();
      let message = "";
      try {
        getDbPool();
      } catch (e) {
        message = (e as Error).message;
      }
      assertEquals(message, "APP_DB_POOL_URL も SUPABASE_DB_URL も設定されていない");
    });
  });
});
