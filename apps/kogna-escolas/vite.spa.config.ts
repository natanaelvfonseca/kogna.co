import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  css: {
    postcss: {
      plugins: [],
    },
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    host: true,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.PORT || 8080}`,
        changeOrigin: true,
        secure: false,
      },
      "/auth": {
        target: `http://localhost:${process.env.PORT || 8080}`,
        changeOrigin: true,
        secure: false,
      },
      "/chat": {
        target: `http://localhost:${process.env.PORT || 8080}`,
        changeOrigin: true,
        secure: false,
      },
      "/message": {
        target: `http://localhost:${process.env.PORT || 8080}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
