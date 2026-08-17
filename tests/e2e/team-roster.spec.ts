// E2E：他チームのメンバーを確認できること。
//
// ★対戦相手が誰なのかは、対戦前に最も知りたい情報である。
//   ランキング・試合の双方から同じチーム詳細へ辿り着けることを確認する。
import { test, expect, createFullTeam, createTestUser, openApp, teamName } from "./fixtures";

test.describe("team roster", () => {
  // ★既定の30秒では足りない。利用者2人分のログインを通すためである。
  test.slow();

  test("reaches another team's members from the ranking", async ({ page }) => {
    // TC-E2E-050
    const owner = await createTestUser("RosterOwner");
    await openApp(page, owner);

    const name = teamName("Roster");
    await page.goto("/team");
    await page.getByLabel("チーム名").fill(name);
    await page.getByRole("button", { name: "チームを作成" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // 別の利用者から見る。自分が所属していないチームである。
    const viewer = await createTestUser("RosterViewer");
    await openApp(page, viewer);

    await page.goto("/ranking");
    await page.getByRole("link", { name }).click();

    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByRole("heading", { name: "メンバー" })).toBeVisible();
    // ★所属していないチームのメンバー名まで見えることが要件である。
    await expect(page.getByText("RosterOwner")).toBeVisible();
    await expect(page.getByText("リーダー")).toBeVisible();
  });

  test("hides the link from signed-out visitors", async ({ page }) => {
    // TC-E2E-051
    // ★メンバー一覧は認証済み限定である（team_detail_view）。
    //   押せてもログイン画面へ弾かれるだけのリンクは出さない。
    const owner = await createTestUser("RosterPublic");
    await openApp(page, owner);

    const name = teamName("Public");
    await page.goto("/team");
    await page.getByLabel("チーム名").fill(name);
    await page.getByRole("button", { name: "チームを作成" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page.getByRole("button", { name: "ログアウト" }).click();
    await page.goto("/ranking");

    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  });

  test("reaches the opponent's members from the match", async ({ page, browser }) => {
    // TC-E2E-052
    // ★誰と当たっているのかは、対戦前に最も知りたい情報である。
    const nameA = await createFullTeam(page, browser, "MatchRosterA");
    await page.goto("/matchmaking");
    await page.getByRole("button", { name: "マッチングを開始" }).click();
    await expect(page.getByText("対戦相手を探しています…")).toBeVisible();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await createFullTeam(pageB, browser, "MatchRosterB");
    await pageB.goto("/matchmaking");
    await pageB.getByRole("button", { name: "マッチングを開始" }).click();

    const overlay = pageB.getByRole("dialog", { name: "対戦相手が決まりました" });
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await overlay.getByRole("button", { name: "試合へ進む" }).click();
    await expect(pageB).toHaveURL(/\/matches\/[0-9a-f-]+$/);

    // 試合画面から相手チームのメンバーへ辿れる
    await pageB.getByRole("link", { name: nameA }).click();
    await expect(pageB.getByRole("heading", { name: "メンバー" })).toBeVisible();
    await expect(pageB.getByText("MatchRosterALeader")).toBeVisible();

    await ctxB.close();
  });
});
