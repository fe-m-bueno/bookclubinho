"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  MessageCircle,
  BookOpen,
  Library,
  BarChart3,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Chat", icon: MessageCircle, segment: "chat" },
  { label: "Rodada", icon: BookOpen, segment: "round" },
  // "Números" e não "Estatísticas": doze caracteres não cabem ao lado de
  // "Encontros" no controle segmentado de 375px. E não "Progresso", que
  // colidiria com o progresso de leitura da rodada, que é outra coisa e vive
  // na aba Rodada.
  { label: "Estante", icon: Library, segment: "shelf" },
  { label: "Números", icon: BarChart3, segment: "stats" },
  { label: "Encontros", icon: Calendar, segment: "meetings" },
] as const;

interface GroupTabBarProps {
  groupId: string;
  variant: "desktop" | "mobile";
  hasMeetingSoon?: boolean;
}

export function GroupTabBar({
  groupId,
  variant,
  hasMeetingSoon,
}: GroupTabBarProps) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const noMotion = shouldReduceMotion ?? false;

  const springTransition = noMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 350, damping: 30 };

  if (variant === "desktop") {
    return (
      <nav
        className="hidden items-center justify-center gap-1 border-b border-border/40 md:flex"
        aria-label="Navegação do grupo"
      >
        {tabs.map(({ label, icon: Icon, segment }) => {
          const href = `/groups/${groupId}/${segment}`;
          const isActive = pathname.startsWith(href);

          return (
            <Link
              key={segment}
              href={href}
              className={cn(
                "type-meta relative flex items-center gap-2 px-5 py-3 transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              {segment === "meetings" && hasMeetingSoon && (
                <span className="size-1.5 rounded-full bg-sage-500" />
              )}
              {isActive && (
                <motion.div
                  layoutId={`tab-underline-${groupId}`}
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary"
                  transition={springTransition}
                />
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  /**
   * Controle segmentado, no fluxo — não é mais barra fixa no rodapé.
   *
   * A barra inferior era a única do app e pertencia ao grupo, não ao app:
   * cobrava 56px permanentes do chat, que é a tela diária, para dar atalho a
   * três telas mensais, e não oferecia caminho de volta para a home. Home é
   * raiz, grupo é pilha — a saída fica no header.
   *
   * No fluxo, e não `sticky`, de propósito: o chat tem altura fixa e não rola,
   * então o controle segue à vista onde é usado; em Estante, Números e
   * Encontros ele sai de cena ao rolar e devolve a tela ao conteúdo.
   */
  return (
    <nav
      // `max-w-md` centralizado: a forma foi desenhada para 375px, onde os
      // cinco rótulos ficam justos de propósito. Esticada até os 767px que
      // antecedem o `md:`, ela vira uma faixa de 700px e deixa de ler como
      // controle segmentado.
      className="mx-auto flex w-full max-w-md items-center gap-0.5 rounded-xl bg-muted/60 p-1 md:hidden"
      aria-label="Navegação do grupo"
    >
      {tabs.map(({ label, segment }) => {
        const href = `/groups/${groupId}/${segment}`;
        const isActive = pathname.startsWith(href);

        return (
          <Link
            key={segment}
            href={href}
            className={cn(
              "type-micro relative flex min-h-9 flex-1 items-center justify-center rounded-lg px-1 transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {isActive && (
              <motion.span
                layoutId={`tab-segment-${groupId}`}
                className="absolute inset-0 rounded-lg bg-card shadow-warm-sm"
                transition={springTransition}
              />
            )}
            <span className="relative truncate">{label}</span>
            {segment === "meetings" && hasMeetingSoon && (
              <span className="relative ml-1 size-1.5 shrink-0 rounded-full bg-sage-500" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
