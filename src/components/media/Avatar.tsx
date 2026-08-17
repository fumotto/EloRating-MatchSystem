// プレイヤーのアイコン。
//
// ★画像が無い場合と読み込めない場合の双方で頭文字を出す。何も出さないと
//   行ごとに高さが変わり、名前の並びが揃わない。
//
// ★配信元は許可リストで絞る（avatarUrl.ts）。DBのCHECK制約が最終の関門だが、
//   制約より前に入った値や、セッションのメタデータのように
//   DBを経由しない値もここへ来る。描画の直前でもう一度確かめる。
//
// ★referrerPolicy を no-referrer にする。どのチームの画面を開いたかを
//   画像の配信元へ渡さないためである。
import { useState } from "react";
import { isAllowedAvatarUrl } from "../../../supabase/functions/_shared/avatarUrl.ts";

function initial(name: string): string {
  // 絵文字や結合文字で壊れないよう、コードポイント単位で1文字取る。
  return [...name.trim()][0] ?? "?";
}

export function Avatar({
  src,
  name,
  size = 32,
}: {
  src: string | undefined;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const usable = !failed && isAllowedAvatarUrl(src);
  const style = { width: size, height: size };

  if (!usable) {
    return (
      <span
        aria-hidden="true"
        style={style}
        className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300"
      >
        {initial(name)}
      </span>
    );
  }

  return (
    <img
      src={src}
      // 名前を隣に必ず出すため、読み上げでは重複させない。
      alt=""
      width={size}
      height={size}
      style={style}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-slate-200 object-cover dark:bg-slate-700"
    />
  );
}
