// E2E：マッチング成立の演出（Issue #5 / Part10 3.2）。
//
// ★2チームを必須人数まで揃えて実際にマッチングを成立させる。
//   演出の内容（相手名・両チームのレート・勝敗時の変動）は、
//   利用者が判断に使う情報であり、出ないと機能の目的を果たさない。
import { test, expect, createTestUser, signIn, waitForProfile, type TestUser } from "./fixtures";
import type { Browser, Page } from "@playwright/test";

const teamName = (label: string) => `E2E ${label} ${Date.now().toString(36)}`;

async function openApp(page: Page, user: TestUser) {
  await signIn(page, user);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await waitForProfile(page, user.id);
}

const REQUIRED_MEMBERS = 3;

async function createFullTeam(page: Page, browser: Browser, label: string): Promise<string> {
  const leader = await createTestUser(`${label}Leader`);
  await openApp(page, leader);

  const name = teamName(label);
  await page.goto("/team");
  await page.getByLabel("チーム名").fill(name);
  await page.getByRole("button", { name: "チームを作成" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  for (let i = 1; i < REQUIRED_MEMBERS; i += 1) {
    await page.goto("/team");
    await page.getByRole("button", { name: "招待コードを発行" }).click();
    const code = await page.locator("p.font-mono").first().innerText();

    const member = await createTestUser(`${label}M${i}`);
    const ctx = await browser.newContext();
    const mp = await ctx.newPage();
    await openApp(mp, member);
    await mp.goto("/team");
    await mp.getByLabel("招待コード").fill(code);
    await mp.getByRole("button", { name: "チームに参加" }).click();
    await expect(mp.getByRole("heading", { name })).toBeVisible();
    await ctx.close();
  }

  return name;
}

test.describe("match found", () => {
  test("shows the match details and moves to the match", async ({ page, browser }) => {
    // TC-E2E-043
    const nameA = await createFullTeam(page, browser, "FoundA");

    // 1チーム目を待機させる
    await page.goto("/matchmaking");
    await page.getByRole("button", { name: "マッチングを開始" }).click();
    await expect(page.getByText("対戦相手を探しています…")).toBeVisible();

    // 2チーム目が待機すると成立する
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const nameB = await createFullTeam(pageB, browser, "FoundB");
    await pageB.goto("/matchmaking");
    await pageB.getByRole("button", { name: "マッチングを開始" }).click();

    // 成立側（B）の画面に演出が出る
    const overlay = pageB.getByRole("dialog", { name: "対戦相手が決まりました" });
    await expect(overlay).toBeVisible({ timeout: 15_000 });

    // 要求された表示項目（Issue #5）
    await expect(overlay).toContainText(nameA); // 相手チーム名
    await expect(overlay).toContainText(nameB); // 自チーム名
    await expect(overlay).toContainText("勝ったら");
    await expect(overlay).toContainText("負けたら");
    await expect(overlay.getByText(/^\+\d+$/)).toBeVisible(); // 加算
    await expect(overlay.getByText(/^−\d+$/)).toBeVisible(); // 減算
    // 両チームのレート（初期値1500が2つ並ぶ）
    await expect(overlay.getByText("1500")).toHaveCount(2);

    // 演出から試合へ進める
    await overlay.getByRole("button", { name: "試合へ進む" }).click();
    await expect(pageB).toHaveURL(/\/matches\/[0-9a-f-]+$/);

    await ctxB.close();
  });
});

test.describe("match settled", () => {
  test("shows the rating change after the match is confirmed", async ({ page, browser }) => {
    // TC-E2E-048 確定時のレート変動表示（Issue #6）。
    //
    // ★申告 → 承認まで通し、実際に確定させてから確認する。
    //   rating_history は確定時にしか作られないため、経路を省略できない。
    const nameA = await createFullTeam(page, browser, "SettleA");

    await page.goto("/matchmaking");
    await page.getByRole("button", { name: "マッチングを開始" }).click();
    await expect(page.getByText("対戦相手を探しています…")).toBeVisible();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await createFullTeam(pageB, browser, "SettleB");
    await pageB.goto("/matchmaking");
    await pageB.getByRole("button", { name: "マッチングを開始" }).click();

    // B が勝利を申告する
    const overlay = pageB.getByRole("dialog", { name: "対戦相手が決まりました" });
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await overlay.getByRole("button", { name: "試合へ進む" }).click();
    await expect(pageB).toHaveURL(/\/matches\/[0-9a-f-]+$/);
    const matchUrl = pageB.url();
    await pageB.getByRole("button", { name: "自チームの勝利を申告" }).click();

    // A（敗者）が承認する
    await page.goto(new URL(matchUrl).pathname);
    await page.getByRole("button", { name: "承認する" }).click();

    // 敗者側にレート減少が出る
    await expect(page.getByText("敗北")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/1500 → 14\d\d/)).toBeVisible();

    // 勝者側にレート増加が出る
    await pageB.reload();
    await expect(pageB.getByText("勝利")).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByText(/1500 → 15\d\d/)).toBeVisible();

    // 相手チーム名が食い違っていないこと（取り違え防止）
    await expect(pageB.getByRole("heading", { level: 1 })).toContainText(nameA);

    await ctxB.close();
  });
});
