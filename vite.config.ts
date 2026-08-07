import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// 配信ベースパス（11_Deployment.md 6章）。
// GitHub Pages がサブパスで配信される場合、ここを誤ると本番でのみアセットが404になる。
// 値は .env の VITE_BASE_PATH から取る。ローカルは "/"。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    base: env.VITE_BASE_PATH || "/",
    // 静的ファイルは public/ に置く（00_DirectoryStructure.md 8章）。
    publicDir: "public",
    plugins: [
      // ルート定義は src/routes/ のファイル構成から生成する（05_Frontend.md 4章・5章）。
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    server: {
      port: 5173,
    },
  };
});
