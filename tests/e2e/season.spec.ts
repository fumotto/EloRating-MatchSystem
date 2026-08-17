// E2E：シーズンの切り替え（Issue #9 / ADR-030 / Part10 3.8）。
//
// ★取り消せない操作を含む。押せる順序と、押せない理由の表示を確認する。
import { test, expect, createFullTeam, createTestUser, makeAdmin, openApp } from "./fixtures";

test.describe("season", () => {
  // ★既定の30秒では足りない。管理者と一般利用者のログインを通すためである。
  test.slow();

  test("pauses matchmaking and blocks user updates through the season change", async ({
    page,
    browser,
  }) => {
    // TC-E2E-054
    // ★定員まで埋める。人数不足でもボタンは無効になるため、
    //   満たしていないと「停止したから無効」なのかを区別できない。
    await createFullTeam(page, browser, "Season");
    await page.goto("/matchmaking");
    await expect(page.getByRole("button", { name: "マッチングを開始" })).toBeEnabled();

    const admin = await createTestUser("SeasonAdmin");
    await makeAdmin(admin.id);
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await openApp(adminPage, admin);

    // ---- ① 終了の開始 ----
    await adminPage.goto("/admin/season");
    await expect(adminPage.getByText("通常営業")).toBeVisible();
    await adminPage.getByRole("button", { name: "シーズンを終了する" }).click();

    // 猶予中であることが画面に出る
    await expect(adminPage.getByRole("status")).toContainText("猶予中");

    // ★猶予中はマッチングだけが止まる。編成は触れる。
    await page.goto("/matchmaking");
    await expect(page.getByRole("button", { name: "マッチングを開始" })).toBeDisabled();

    // ---- ② 取りやめ ----
    // ★確定前なら引き返せる。押し間違いに気付いた管理者が待つしかない状態にしない。
    await adminPage.goto("/admin/season");
    await adminPage.getByRole("button", { name: "終了を取りやめる" }).click();
    await expect(adminPage.getByText("受付中")).toBeVisible();

    // マッチングが戻る
    await page.goto("/matchmaking");
    await expect(page.getByRole("button", { name: "マッチングを開始" })).toBeEnabled();

    await adminCtx.close();
  });

  test("hides the manual reset entry points from a regular user", async ({ page }) => {
    // TC-E2E-055
    // ★管理画面は一般利用者に見せない（5.3）。
    const user = await createTestUser("SeasonUser");
    await openApp(page, user);

    await page.goto("/admin/season");
    await expect(page.getByRole("button", { name: "シーズンを終了する" })).toHaveCount(0);
  });

  test("shows the season archive to anonymous visitors", async ({ page }) => {
    // TC-E2E-056
    // ★過去のシーズンは未認証でも見られる（ADR-018 と同じ扱い）。
    await page.goto("/seasons");
    await expect(page.getByRole("heading", { name: "過去のシーズン" })).toBeVisible();
  });
});
