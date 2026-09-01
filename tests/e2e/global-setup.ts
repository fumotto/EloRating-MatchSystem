// E2E の前処理（10_TestSpecification_Part10_E2E.md / ADR-036 ⑤）。
//
// サブアカウント対策を検証環境で切る。**ここが本番と検証環境の唯一の差である。**
//
// ★Seed（0014_seed.sql）の既定値は本番と同じ「有効」のままにしてある。既定値を環境ごとに
//   分けると、CI で通ったものが本番では違う挙動になる。差は実行時にここで付ける。
//
// ★service_role で system_settings を直接書き換えない。0013_rls.sql はどのクライアント
//   ロールにも書き込みを与えておらず、更新は Edge Functions がDB直結で行う（ADR-016）。
//   ここも管理者として実経路（admin-update-system-settings）を通す。
//   実経路を通すこと自体が、⑤の ON/OFF が管理画面から操作できることの検証になっている。
//
// ★ランキング掲載の最低対戦相手数（ranking_min_opponents）は必ず切る必要がある。
//   既定の 3 のままだと、1試合しかしないシナリオのチームが一覧に現れず、
//   ランキングからチーム詳細へ辿る検証（team-roster.spec.ts）が落ちる。
//
// ★ペア再戦の抑止（rematch_cooldown_hours）は、E2E が毎回まっさらなチームを作るため
//   そのままでも通る。切っているのは、抑止が効き始めた瞬間に原因の分からない
//   「マッチが成立しない」失敗へ化けることを避けるためである。
import { updateSystemSettings } from "./fixtures";

export default async function globalSetup(): Promise<void> {
  await updateSystemSettings("GuardSetupAdmin", {
    rematchCooldownHours: 0,
    rankingMinOpponents: 0,
  });
}
