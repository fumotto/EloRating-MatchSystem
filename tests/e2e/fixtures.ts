// E2E の共通フィクスチャ（10_TestSpecification_Part10_E2E.md）。
//
// ★実際の Discord ログインは自動化できない（外部サービスの画面を操作することになる）。
//   代わりに Supabase Admin API で利用者を作り、取得したセッションを
//   localStorage へ注入してログイン済み状態を再現する。
//   検証対象は「ログイン後のアプリの振る舞い」であり、OAuthの往復そのものではない。
//   OAuthの往復は SetupRunbook 作業3の手動確認が担う。
import { test as base, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

let sequence = 0;

// 一意な利用者を作る。テスト間で所属や待機が干渉しないよう毎回新規に作る。
export async function createTestUser(displayName: string): Promise<TestUser> {
  sequence += 1;
  const email = `e2e-${Date.now()}-${sequence}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}A1!`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // ★ensure-profile は JWT の app_metadata.provider と user_metadata.provider_id を見る
    //   （ADR-022 / B-009）。profiles.auth_provider は 'steam' / 'discord' しか受け付けないため、
    //   メール認証の既定値 'email' のままだと CHECK制約違反でプロフィールを作れない。
    //   E2E では Discord 利用者として振る舞わせる。
    app_metadata: { provider: "discord", providers: ["discord"] },
    // ★provider_id は (auth_provider, provider_user_id) の UNIQUE に効く。
    //   実行ごとの連番だけでは前回の実行と衝突する。
    user_metadata: { provider_id: `e2e-${Date.now()}-${sequence}`, full_name: displayName },
  });

  if (error || !data.user) {
    throw new Error(`テスト利用者を作成できない: ${error?.message}`);
  }

  return { id: data.user.id, email, password, displayName };
}

export async function makeAdmin(userId: string): Promise<void> {
  // 管理者判定は app_metadata.role のみである（ADR-020）。
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role: "admin" },
  });
  if (error) throw new Error(`管理者を付与できない: ${error.message}`);
}

// アプリ自身の Supabase クライアントにログインさせる。
//
// ★localStorage へセッションを書き込む方式は採らない。保存形式はSDKの内部仕様であり、
//   版が上がると黙って読まれなくなる（実際にそうなった）。
//   src/lib/supabase.ts が開発ビルドでのみ公開する口を使う。
export async function signIn(page: Page, user: TestUser): Promise<void> {
  // 口が生えるのはアプリの読み込み後であるため、一度開いてから呼ぶ。
  await page.goto("/ranking");
  await page.waitForFunction(() => "__supabaseForTest" in globalThis);

  const failure = await page.evaluate(
    async ({ email, password }) => {
      const client = (
        globalThis as unknown as {
          __supabaseForTest: {
            auth: {
              signInWithPassword(c: {
                email: string;
                password: string;
              }): Promise<{ error: { message: string } | null }>;
            };
          };
        }
      ).__supabaseForTest;

      const { error } = await client.auth.signInWithPassword({ email, password });
      return error?.message ?? null;
    },
    { email: user.email, password: user.password },
  );

  if (failure) {
    throw new Error(`テストログインに失敗した: ${failure}`);
  }
}

// プロフィールが作られるまで待つ。
//
// ★アプリはログイン確立後に ensure-profile を非同期で呼ぶ（App.tsx）。
//   その完了前にチーム作成を実行すると profiles への外部キー違反になる。
//   人の操作では起こりにくいが、E2E は速いので必ず踏む。
//
// ★確認はブラウザ側のクライアントで行う。service_role には profiles の GRANT が無く
//   （0013_rls.sql は authenticated にのみ与える）、PostgREST 経由では読めない。
export async function waitForProfile(page: Page, userId: string): Promise<void> {
  await page.waitForFunction(
    async (id) => {
      const client = (
        globalThis as unknown as {
          __supabaseForTest: {
            from(table: string): {
              select(columns: string): {
                eq(
                  column: string,
                  value: string,
                ): {
                  maybeSingle(): Promise<{ data: unknown }>;
                };
              };
            };
          };
        }
      ).__supabaseForTest;

      const { data } = await client.from("profiles").select("id").eq("id", id).maybeSingle();
      return data !== null;
    },
    userId,
    { timeout: 15_000 },
  );
}

export const test = base;
export { expect };

// システム設定の更新（04_BackendInterface.md 12.3）。
//
// ★service_role では更新できない。0013_rls.sql は system_settings の書き込みを
//   どのクライアントロールへも与えておらず、更新は Edge Functions がDB直結で行う
//   （ADR-016）。したがってテストも管理者として実経路を通す。
//
//   管理者を都度作るのは冗長に見えるが、権限まわりを迂回しない利点の方が大きい。
export async function updateSystemSettings(
  label: string,
  body: Record<string, unknown>,
): Promise<void> {
  const user = await createTestUser(label);
  await makeAdmin(user.id);

  // 管理者付与の後にサインインする。role は発行時のJWTへ載る（ADR-020）。
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session) {
    throw new Error(`管理者でサインインできない: ${error?.message}`);
  }

  // ★先に ensure-profile を呼ぶ。audit_logs.actor_profile_id は profiles を参照しており、
  //   プロフィールが無いまま設定を更新すると外部キー違反で SYSTEM-001 になる。
  //   アプリはログイン確立後にこれを呼ぶ（App.tsx）。テストも同じ順序を踏む。
  const ensured = await fetch(`${SUPABASE_URL}/functions/v1/ensure-profile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ displayName: user.displayName }),
  });
  if (!ensured.ok) {
    throw new Error(`プロフィールを用意できない: ${ensured.status} ${await ensured.text()}`);
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-update-system-settings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`システム設定を更新できない: ${res.status} ${await res.text()}`);
  }
}

// お知らせの設定（Issue #7）。
export async function setAnnouncement(text: string, level: "INFO" | "WARN" | "ALERT") {
  await updateSystemSettings("AnnouncementAdmin", {
    announcementText: text,
    announcementLevel: level,
  });
}

// ---- 画面操作の共通手順 ----
//
// ★複数の spec が同じ準備を必要とする。各ファイルに書き写すと、
//   必須人数や導線が変わったときに直し漏れが出る。

export const teamName = (label: string) => `E2E ${label} ${Date.now().toString(36)}`;

export async function openApp(page: Page, user: TestUser): Promise<void> {
  await signIn(page, user);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await waitForProfile(page, user.id);
}

// マッチングに必要な人数。system_settings の既定値と揃える。
export const REQUIRED_MEMBERS = 3;

// 必須人数まで揃ったチームを作り、チーム名を返す。
export async function createFullTeam(page: Page, browser: Browser, label: string): Promise<string> {
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
