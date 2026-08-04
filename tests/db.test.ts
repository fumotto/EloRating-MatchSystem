import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  getDbPool,
  setDbPool,
  resetDbPool,
  withTransaction,
} from "../supabase/functions/_shared/db.ts";

// モックは deno-postgres の PoolClient に合わせ、query ではなく queryObject を持たせる。
class MockTransaction {
  calls: string[] = [];
  released = false;

  async queryObject(sql: string): Promise<void> {
    this.calls.push(sql);
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

Deno.test("setDbPoolでプールを注入し、getDbPoolから返ること", () => {
  const mockPool = new MockPool(new MockTransaction());
  setDbPool(mockPool as never);

  assertEquals(getDbPool(), mockPool as never);

  resetDbPool();
});

Deno.test("withTransactionが正常時にBEGIN・COMMITを発行しreleaseすること", async () => {
  const mockTx = new MockTransaction();
  setDbPool(new MockPool(mockTx) as never);

  const result = await withTransaction(async () => "success");

  assertEquals(result, "success");
  assertEquals(mockTx.calls, ["BEGIN", "COMMIT"]);
  assertEquals(mockTx.released, true);

  resetDbPool();
});

Deno.test("withTransactionが例外時にROLLBACKを発行し、例外を伝播しreleaseすること", async () => {
  const mockTx = new MockTransaction();
  setDbPool(new MockPool(mockTx) as never);

  await assertRejects(
    () => withTransaction(async () => {
      throw new Error("業務エラー");
    }),
    Error,
    "業務エラー",
  );

  assertEquals(mockTx.calls, ["BEGIN", "ROLLBACK"]);
  assertEquals(mockTx.released, true);

  resetDbPool();
});

Deno.test("withTransactionが渡すtxでqueryObjectを実行できること", async () => {
  const mockTx = new MockTransaction();
  setDbPool(new MockPool(mockTx) as never);

  await withTransaction(async (tx) => {
    await tx.queryObject("SELECT 1");
  });

  assertEquals(mockTx.calls, ["BEGIN", "SELECT 1", "COMMIT"]);

  resetDbPool();
});
