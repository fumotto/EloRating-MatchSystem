// Vitest の共通セットアップ（10_TestSpecification.md 3章）。
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// ★描画した DOM をテストごとに片付ける。
//
//   React Testing Library は globals: true のときだけ自動で cleanup を登録する。
//   本プロジェクトは globals を有効にしていないため、明示的に登録する。
//
//   登録しないと前のテストの DOM が document.body に残り、screen.* が
//   別のテストの要素を拾う。「出ないこと」を確かめる検証が偽陽性で落ちるほか、
//   逆に「出ること」の検証が前のテストのおかげで通ってしまう。後者の方が危険である。
afterEach(() => {
  cleanup();
});
