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
}

export function GroupTabBar({ groupId, variant }: GroupTabBarProps) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const noMotion = shouldReduceMotion ?? false;

  const isDesktop = variant === "desktop";

  return (
    <nav
      className={cn(
        "flex items-center justify-around",
        isDesktop
          ? "hidden md:flex border-b border-border px-4 gap-1"
          : "fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]"
      )}
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
              "relative flex flex-col items-center justify-center min-h-[44px] px-3 py-2 text-xs font-medium transition-colors",
              isDesktop && "flex-row gap-1.5 text-sm px-4",
              isActive ? "text-foreground" : "text-muted-foreground"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className={cn("h-5 w-5", isDesktop && "h-4 w-4")} />
            <span>{label}</span>
            {isActive && (
              <motion.div
                layoutId={`active-tab-underline-${groupId}-${variant}`}
                className={cn(
                  "absolute bg-brand-500 rounded-full",
                  isDesktop
                    ? "bottom-0 left-3 right-3 h-0.5"
                    : "top-0 left-3 right-3 h-0.5"
                )}
                transition={
                  noMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 400, damping: 30 }
                }
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
