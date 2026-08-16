// E2E：未認証で閲覧できる範囲（Part10 3.3）。
//
// ランキングの公開は ADR-018 の中心的な決定である。ここが壊れると設計意図が失われる。
import { test, expect, setAnnouncement } from "./fixtures";

test.describe("anonymous visitor", () => {
  test("serves the ranking to anonymous visitors", async ({ page }) => {
    // TC-E2E-023 ログインを経ずに /ranking へ直接遷移する。
    await page.goto("/ranking");

    await expect(page.getByRole("heading", { name: "ランキング" })).toBeVisible();
    // ログインへリダイレクトされていないこと。
    await expect(page).toHaveURL(/\/ranking$/);
  });

  test("serves the rules page to anonymous visitors", async ({ page }) => {
    // TC-E2E-026 ルールページは誰でも閲覧できる（Issue #8）。
    await page.goto("/rules");

    await expect(page.getByRole("heading", { name: "ルール", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/rules$/);

    // ヘッダーの導線もログイン状態を問わず出る。
    await expect(page.getByRole("link", { name: "ルール" })).toBeVisible();
  });

  test("shows the announcement banner to anonymous visitors", async ({ page }) => {
    // TC-E2E-027 お知らせの帯（Issue #7）。未ログインにも届ける必要がある
    // （メンテナンス告知など）。設定は public_settings 経由で読む。
    await setAnnouncement("E2E メンテナンス告知", "WARN");
    try {
      await page.goto("/ranking");
      const banner = page.getByRole("status");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText("E2E メンテナンス告知");
    } finally {
      await setAnnouncement("", "INFO");
    }
  });

  test("hides the banner when the announcement is empty", async ({ page }) => {
    // TC-E2E-028 空なら帯そのものを出さない。
    // ★空の帯が残ると常時1行分の余白が空き、壊れているように見える。
    await setAnnouncement("", "INFO");

    await page.goto("/ranking");
    await expect(page.getByRole("heading", { name: "ランキング" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("lists teams that have never played", async ({ page }) => {
    // TC-E2E-025 試合未実施のチームも一覧に出る。勝率は空欄で示す。
    await page.goto("/ranking");
    await expect(page.getByRole("heading", { name: "ランキング" })).toBeVisible();

    // 0件でも表示が壊れないこと。文言は RankingTable の空状態に合わせる。
    const table = page.getByRole("table");
    await expect(table.or(page.getByText("まだチームがありません"))).toBeVisible();
  });

  test("sends an anonymous visitor to the login page for protected routes", async ({ page }) => {
    // Route Guard（05_Frontend.md 5.3）。未認証は /login へリダイレクトする。
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows a 403 notice instead of revealing the admin screens", async ({ page }) => {
    // 管理画面は未認証・非管理者に対して同じ403表示とする（_admin.tsx）。
    await page.goto("/admin");
    await expect(page.getByText("この画面を表示する権限がありません")).toBeVisible();
  });

  test("renders the not found page for unknown routes", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByText("ページが見つかりません")).toBeVisible();
  });
});
