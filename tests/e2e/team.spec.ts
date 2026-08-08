// E2E：認証とチーム、マッチング待機（Part10 3.1・3.2）。
//
// Edge Functions が起動している必要がある（supabase functions serve --env-file .env）。
import { test, expect, createTestUser, signIn, waitForProfile, type TestUser } from "./fixtures";

// 一意なチーム名。teams.name は UNIQUE のため、実行のたびに変える必要がある。
const teamName = (label: string) => `E2E ${label} ${Date.now().toString(36)}`;

async function openApp(page: import("@playwright/test").Page, user: TestUser) {
  await signIn(page, user);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  // 先にプロフィールが確定していないと、以降の操作が外部キー違反になる。
  await waitForProfile(page, user.id);
}

test.describe("team flow", () => {
  test("creates a team and becomes its leader", async ({ page }) => {
    // TC-E2E-003
    const user = await createTestUser("Leader");
    await openApp(page, user);

    const name = teamName("Create");
    await page.goto("/team");
    await page.getByLabel("チーム名").fill(name);
    await page.getByRole("button", { name: "チームを作成" }).click();

    await expect(page.getByRole("heading", { name })).toBeVisible();
    // 作成者はリーダーである。招待の発行欄はリーダーにのみ出る。
    await expect(page.getByRole("heading", { name: "メンバーを招待する" })).toBeVisible();
    await expect(page.getByText("リーダー")).toBeVisible();
  });

  test("invites and joins a member", async ({ page, browser }) => {
    // TC-E2E-004 チーム参加は招待制のみである（ADR-013）。
    const leader = await createTestUser("Leader");
    const member = await createTestUser("Member");

    await openApp(page, leader);

    const name = teamName("Invite");
    await page.goto("/team");
    await page.getByLabel("チーム名").fill(name);
    await page.getByRole("button", { name: "チームを作成" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page.getByRole("button", { name: "招待コードを発行" }).click();
    // ★平文コードは発行時の応答でしか得られない（04 9.3）。画面から読み取るしかない。
    const code = await page.locator("p.font-mono").first().innerText();
    expect(code).toMatch(/^[A-Z2-7]{26}$/);

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await openApp(memberPage, member);

    await memberPage.goto("/team");
    await memberPage.getByLabel("招待コード").fill(code);
    await memberPage.getByRole("button", { name: "チームに参加" }).click();

    await expect(memberPage.getByRole("heading", { name })).toBeVisible();
    // 参加者は MEMBER である。リーダーにはならない。
    await expect(memberPage.getByRole("heading", { name: "メンバーを招待する" })).toBeHidden();

    await memberContext.close();
  });

  test("rejects an unknown invite code", async ({ page }) => {
    // TC-E2E-005 の隣接ケース。存在しないコードは INVITE-001 となる。
    const user = await createTestUser("Joiner");
    await openApp(page, user);

    await page.goto("/team");
    await page.getByLabel("招待コード").fill("AAAAAAAAAAAAAAAAAAAAAAAAAA");
    await page.getByRole("button", { name: "チームに参加" }).click();

    // 表示文言は error.code から生成される（12.2）。
    await expect(page.getByRole("alert")).toContainText("招待が存在しません");
  });

  test("keeps waiting when no opponent is available", async ({ page }) => {
    // TC-E2E-011 相手が見つからないのはエラーではない（09 12章）。
    const user = await createTestUser("Waiter");
    await openApp(page, user);

    const name = teamName("Queue");
    await page.goto("/team");
    await page.getByLabel("チーム名").fill(name);
    await page.getByRole("button", { name: "チームを作成" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page.goto("/matchmaking");
    await page.getByRole("button", { name: "マッチングを開始" }).click();

    await expect(page.getByText("対戦相手を探しています…")).toBeVisible();
    // エラー表示が出ていないこと。ここが赤くなるのは設計意図に反する。
    await expect(page.getByRole("alert")).toBeHidden();

    // ★待機を残したまま終えてはならない。次のテストのチームと成立してしまい、
    //   そちらが「待機中」を観測できなくなる。
    await page.getByRole("button", { name: "待機をキャンセル" }).click();
    await expect(page.getByRole("button", { name: "マッチングを開始" })).toBeVisible();
  });

  test("cancels matchmaking", async ({ page }) => {
    // TC-E2E-012
    const user = await createTestUser("Canceller");
    await openApp(page, user);

    const name = teamName("Cancel");
    await page.goto("/team");
    await page.getByLabel("チーム名").fill(name);
    await page.getByRole("button", { name: "チームを作成" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page.goto("/matchmaking");
    await page.getByRole("button", { name: "マッチングを開始" }).click();
    await expect(page.getByText("対戦相手を探しています…")).toBeVisible();

    await page.getByRole("button", { name: "待機をキャンセル" }).click();
    await expect(page.getByRole("button", { name: "マッチングを開始" })).toBeVisible();
  });
});
