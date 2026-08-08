import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// O CI roda em UTC e as máquinas do time em `America/Sao_Paulo`. Qualquer teste
// que envolva dia do calendário — prazo de rodada, streak, separador do chat —
// passaria num fuso e falharia no outro se o ambiente decidisse por ele.
// Fixar aqui, no processo que gera os workers, faz os dois concordarem.
process.env.TZ = "America/Sao_Paulo";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    exclude: ["e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
