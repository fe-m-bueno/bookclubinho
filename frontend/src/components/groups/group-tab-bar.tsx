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
  { label: "Shelf", icon: Library, segment: "shelf" },
  { label: "Stats", icon: BarChart3, segment: "stats" },
  { label: "Encontros", icon: Calendar, segment: "meetings" },
] as const;

interface GroupTabBarProps {
  groupId: string;
  variant: "desktop" | "mobile";
  hasMeetingSoon?: boolean;
}

export function GroupTabBar({ groupId, variant, hasMeetingSoon }: GroupTabBarProps) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const noMotion = shouldReduceMotion ?? false;

  const isDesktop = variant === "desktop";

  if (isDesktop) {
    return (
      <nav
        className="hidden md:flex items-center gap-1 bg-card rounded-2xl shadow-sm p-1.5"
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
                "relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors flex-1 justify-center",
                isActive
                  ? "text-brand-900 dark:text-brand-100"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId={`tab-pill-${groupId}-desktop`}
                  className="absolute inset-0 bg-brand-200/60 dark:bg-brand-800/40 rounded-xl"
                  transition={
                    noMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 350, damping: 30 }
                  }
                />
              )}
              <span className="relative z-10">
                <Icon className="h-4 w-4" />
                {segment === "meetings" && hasMeetingSoon && (
                  <span className="absolute -top-1 -right-1 size-2 rounded-full bg-brand-500" />
                )}
              </span>
              <span className="relative z-10">{label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card/95 backdrop-blur-md border-t border-border/50 pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegação do grupo"
    >
      <div className="flex items-center justify-around px-2 py-1.5">
        {tabs.map(({ label, icon: Icon, segment }) => {
          const href = `/groups/${groupId}/${segment}`;
          const isActive = pathname.startsWith(href);

          return (
            <Link
              key={segment}
              href={href}
              className={cn(
                "relative flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 text-[10px] font-medium rounded-xl transition-colors",
                isActive
                  ? "text-brand-900 dark:text-brand-100"
                  : "text-muted-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId={`tab-pill-${groupId}-mobile`}
                  className="absolute inset-0.5 bg-brand-200/50 dark:bg-brand-800/30 rounded-xl"
                  transition={
                    noMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 350, damping: 30 }
                  }
                />
              )}
              <span className="relative z-10">
                <Icon className="h-5 w-5 mb-0.5" />
                {segment === "meetings" && hasMeetingSoon && (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-brand-500" />
                )}
              </span>
              <span className="relative z-10">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
