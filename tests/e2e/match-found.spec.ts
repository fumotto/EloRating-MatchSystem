// E2E：マッチング成立の演出（Issue #5 / Part10 3.2）。
//
// ★2チームを必須人数まで揃えて実際にマッチングを成立させる。
//   演出の内容（相手名・両チームのレート・勝敗時の変動）は、
//   利用者が判断に使う情報であり、出ないと機能の目的を果たさない。
import { test, expect, createFullTeam } from "./fixtures";

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
    // ★**投了**で確定させる。運用の原則は「負けたチームが投了する」であり、
    //   勝者申告はその代替である（ADR-032 ①）。基本の経路を通す。
    // ★投了は二段階のUIである。確認ダイアログを経ないと確定しない
    //   （05_Frontend.md 14.6 / TC-UI-201）。ここでその経路も通す。
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

    const overlay = pageB.getByRole("dialog", { name: "対戦相手が決まりました" });
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await overlay.getByRole("button", { name: "試合へ進む" }).click();
    await expect(pageB).toHaveURL(/\/matches\/[0-9a-f-]+$/);
    const matchUrl = pageB.url();

    // A（敗者）が投了する。承認は要らない。
    await page.goto(new URL(matchUrl).pathname);
    await page.getByRole("button", { name: "投了する（負けを認める）" }).click();

    // ★確認ダイアログが挟まる。相手チーム名が出ていること。
    const confirm = page.getByRole("dialog", { name: "投了しますか？" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("取り消せません");
    await confirm.getByRole("button", { name: "確定する" }).click();

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
