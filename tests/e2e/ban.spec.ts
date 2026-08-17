// E2E：BANされたチームの挙動（Part10 3.4）。
//
// ★BANはチームの活動を凍結する措置である。編成を変えられると、
//   全員が抜けて作り直すことで制裁を回避できてしまう。
import { test, expect, createTestUser, makeAdmin, openApp, teamName } from "./fixtures";

test.describe("banned team", () => {
  // ★既定の30秒では足りない。利用者2人分のログインと管理画面の操作を通すためである。
  test.slow();

  test("freezes roster changes and matchmaking", async ({ page, browser }) => {
    // TC-E2E-049
    const leader = await createTestUser("BanLeader");
    await openApp(page, leader);

    const name = teamName("Banned");
    await page.goto("/team");
    await page.getByLabel("チーム名").fill(name);
    await page.getByRole("button", { name: "チームを作成" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // 管理者がBANする
    const admin = await createTestUser("BanAdmin");
    await makeAdmin(admin.id);
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await openApp(adminPage, admin);

    await adminPage.goto("/admin/teams");
    await adminPage.getByLabel(/BANの理由/).fill("E2E 検証のため");
    await adminPage
      .locator("li")
      .filter({ hasText: name })
      .getByRole("button", { name: "BAN" })
      .click();

    // BANされた側の画面
    await page.goto("/team");
    await expect(page.getByRole("status")).toContainText("BANされています");

    // ★編成の変更ができないこと
    await expect(page.getByRole("button", { name: "チームを脱退する" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "招待コードを発行" })).toHaveCount(0);

    // ★マッチングもできないこと
    await page.goto("/matchmaking");
    await expect(page.getByRole("button", { name: "マッチングを開始" })).toBeDisabled();

    await adminCtx.close();
  });
});
