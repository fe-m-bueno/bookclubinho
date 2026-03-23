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
                "relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors",
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

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Navegação do grupo"
    >
      <div className="flex items-center justify-around px-2 py-1">
        {tabs.map(({ label, icon: Icon, segment }) => {
          const href = `/groups/${groupId}/${segment}`;
          const isActive = pathname.startsWith(href);

          return (
            <Link
              key={segment}
              href={href}
              className={cn(
                "relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center px-2 py-1.5 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId={`tab-accent-${groupId}-mobile`}
                  className="absolute top-0 left-3 right-3 h-0.5 rounded-full bg-primary"
                  transition={springTransition}
                />
              )}
              <span className="relative">
                <Icon className="mb-0.5 h-5 w-5" />
                {segment === "meetings" && hasMeetingSoon && (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-sage-500" />
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
