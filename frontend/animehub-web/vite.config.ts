import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, resolve(rootDir, "../.."), ""),
    ...loadEnv(mode, rootDir, ""),
  };
  const apiTarget = env.VITE_API_TARGET || "https://127.0.0.1:7162";
  const devPort = Number(env.VITE_DEV_PORT || 5173);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        react: resolve(rootDir, "node_modules/react"),
        "react-dom": resolve(rootDir, "node_modules/react-dom"),
      },
    },
    server: {
      port: devPort,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    test: {
      environment: "jsdom",
    },
  };
});
