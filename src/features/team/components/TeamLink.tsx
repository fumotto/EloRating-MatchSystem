// チーム詳細（メンバー一覧）への導線。
//
// ★1か所にまとめる。ランキング・試合の双方から同じ場所へ飛ばすためである。
//   別々に書くと、片方だけ遷移先や見た目がずれる。
//
// ★未認証には出さない。メンバー一覧は team_detail_view から取るが、
//   同Viewは認証済み限定である（11_views.sql 冒頭・ADR-018）。
//   リンクだけ見せてもログイン画面へ弾かれるだけで、押した意味が伝わらない。
//   出すかどうかは呼び出し側が判断する。
import { Link } from "@tanstack/react-router";

export function TeamLink({ teamId, teamName }: { teamId: string; teamName: string }) {
  return (
    <Link
      to="/team/$teamId"
      params={{ teamId }}
      className="text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {teamName}
    </Link>
  );
}
