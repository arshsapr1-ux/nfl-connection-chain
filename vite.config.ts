import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/client",
  publicDir: "../../public",
  plugins: [react()],
  build: { outDir: "../../dist/client", emptyOutDir: true },
  test: { root: ".", include: ["src/**/*.test.ts"] },
} as any);
