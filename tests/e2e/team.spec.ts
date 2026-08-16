// E2E：認証とチーム、マッチング待機（Part10 3.1・3.2）。
//
// Edge Functions が起動している必要がある（supabase functions serve --env-file .env）。
import { test, expect, createTestUser, signIn, waitForProfile, type TestUser } from "./fixtures";
import type { Browser, Page } from "@playwright/test";

// 一意なチーム名。teams.name は UNIQUE のため、実行のたびに変える必要がある。
const teamName = (label: string) => `E2E ${label} ${Date.now().toString(36)}`;

async function openApp(page: Page, user: TestUser) {
  await signIn(page, user);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  // 先にプロフィールが確定していないと、以降の操作が外部キー違反になる。
  await waitForProfile(page, user.id);
}

// マッチング待機には必須人数を満たす必要がある（09 4.1 / QUEUE-005）。
// 必須人数は system_settings.team_max_members と等しく、seed の既定は3である（0009 / 0014）。
const REQUIRED_MEMBERS = 3;

// チームを必須人数まで埋める。page はリーダーのものを渡す。
//
// ★参加は招待制のみである（ADR-013）。service_role で team_members へ直接 INSERT する
//   近道は採らない。0013_rls.sql の GRANT は authenticated にしか与えておらず PostgREST から
//   書けないうえ、経路を迂回すると「招待を経ずに人数が揃った」本番に存在しない状態を
//   検証することになる。
async function fillTeamToRequiredSize(page: Page, browser: Browser, name: string): Promise<void> {
  // リーダーが1人目である。残りを招待で埋める。
  for (let i = 1; i < REQUIRED_MEMBERS; i += 1) {
    await page.goto("/team");
    await page.getByRole("button", { name: "招待コードを発行" }).click();
    // 平文コードは発行時の応答でしか得られない（04 9.3）。画面から読み取る。
    const code = await page.locator("p.font-mono").first().innerText();

    const member = await createTestUser(`Filler${i}`);
    const context = await browser.newContext();
    const memberPage = await context.newPage();
    await openApp(memberPage, member);

    await memberPage.goto("/team");
    await memberPage.getByLabel("招待コード").fill(code);
    await memberPage.getByRole("button", { name: "チームに参加" }).click();
    await expect(memberPage.getByRole("heading", { name })).toBeVisible();

    await context.close();
  }
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

  test("keeps waiting when no opponent is available", async ({ page, browser }) => {
    // TC-E2E-011 相手が見つからないのはエラーではない（09 12章）。
    const user = await createTestUser("Waiter");
    await openApp(page, user);

    const name = teamName("Queue");
    await page.goto("/team");
    await page.getByLabel("チーム名").fill(name);
    await page.getByRole("button", { name: "チームを作成" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // 必須人数に満たないチームは待機できない（09 4.1）。
    await fillTeamToRequiredSize(page, browser, name);

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

  test("cancels matchmaking", async ({ page, browser }) => {
    // TC-E2E-012
    const user = await createTestUser("Canceller");
    await openApp(page, user);

    const name = teamName("Cancel");
    await page.goto("/team");
    await page.getByLabel("チーム名").fill(name);
    await page.getByRole("button", { name: "チームを作成" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await fillTeamToRequiredSize(page, browser, name);

    await page.goto("/matchmaking");
    await page.getByRole("button", { name: "マッチングを開始" }).click();
    await expect(page.getByText("対戦相手を探しています…")).toBeVisible();

    await page.getByRole("button", { name: "待機をキャンセル" }).click();
    await expect(page.getByRole("button", { name: "マッチングを開始" })).toBeVisible();
  });

  test("blocks matchmaking for a team below the required size", async ({ page }) => {
    // TC-E2E-022 必須人数に満たないチームは待機できない（09 4.1 / QUEUE-005）。
    const user = await createTestUser("Solo");
    await openApp(page, user);

    const name = teamName("Short");
    await page.goto("/team");
    await page.getByLabel("チーム名").fill(name);
    await page.getByRole("button", { name: "チームを作成" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // リーダー1人だけの状態。
    await page.goto("/matchmaking");

    const startButton = page.getByRole("button", { name: "マッチングを開始" });

    // ★ボタンは最初から存在し、非活性である。案内と同時に見えていること。
    //   消して入れ替える形にすると、人数が確定するまでの間だけ押せる状態が見える。
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeDisabled();
    await expect(page.getByText("チーム人数が足りません")).toBeVisible();
  });

  test("shows the top page entry points to anonymous visitors", async ({ page }) => {
    // TC-E2E-044 トップページ（Issue #8）。未ログインで3つの導線が出る。
    await page.goto("/");

    await expect(page.getByRole("link", { name: "ログインせずに入場" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ルールを読む" })).toBeVisible();

    // 「ログインせずに入場」からランキングへ進める（ADR-018）。
    await page.getByRole("link", { name: "ログインせずに入場" }).click();
    await expect(page).toHaveURL(/\/ranking$/);
  });

  test("keeps the requested route on a direct visit", async ({ page }) => {
    // TC-E2E-024 ログイン済みでの保護ルートへの直接遷移。
    //
    // ★セッション確定前にルータのマッチを作り直すと、ガードが未ログインと誤判定して
    //   /login へ飛ばし、そこから /dashboard へ跳ね返る。行き先が常に /dashboard に
    //   化けるため、遷移先を見ないテストでは検出できない。URL で固定する。
    const user = await createTestUser("Direct");
    await openApp(page, user);

    await page.goto("/team");
    await expect(page).toHaveURL(/\/team$/);
    await expect(page.getByRole("heading", { name: "マイチーム" })).toBeVisible();

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("logs out and returns to the top page", async ({ page }) => {
    // TC-E2E-023 ログアウト後はトップページへ戻り、ヘッダーが未ログインの状態になる。
    //
    // ★セッションを消すだけではマッチのコンテキストが古いままになり、
    //   「ログアウト」が出続ける。App.tsx の invalidate がこれを防ぐ。
    //
    // 遷移先はトップページである（Issue #8）。以前は /ranking だった。
    const user = await createTestUser("Leaver");
    await openApp(page, user);

    await page.getByRole("button", { name: "ログアウト" }).click();

    await expect(page).toHaveURL(/\/$/);

    // ★ヘッダーに限定して判定する。トップページ本体にも「ログイン」があり、
    //   「ログインせずに入場」も部分一致するため、素のセレクタでは複数一致になる。
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "ログイン", exact: true })).toBeVisible();
    await expect(header.getByRole("button", { name: "ログアウト" })).toBeHidden();
  });
});
