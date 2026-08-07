"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  /**
   * `resolvedTheme` e não `theme`: com `defaultTheme="system"`, `theme` vale
   * `"system"` até o usuário escolher algo, e comparar isso com `"dark"` dá
   * falso mesmo com a página escura. Era o que fazia o primeiro clique gravar
   * o tema que já estava em vigor — botão sem resposta para quem usa o SO em
   * dark. `resolvedTheme` é sempre `"light"` ou `"dark"`.
   */
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-10 w-10" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-background/80 text-lg backdrop-blur-sm transition-all hover:bg-primary/10 hover:scale-105 active:scale-95"
      aria-label="Alternar tema"
    >
      {/* Ícone é estado, não ação: mostra onde a pessoa está. */}
      {isDark ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
