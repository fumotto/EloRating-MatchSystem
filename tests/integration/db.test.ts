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
