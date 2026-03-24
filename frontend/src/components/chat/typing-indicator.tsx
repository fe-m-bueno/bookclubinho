"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { TypingUser } from "@/lib/types/chat";

interface TypingIndicatorProps {
  users: TypingUser[];
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "600ms" }}
        />
      ))}
    </span>
  );
}

function formatTypingText(users: TypingUser[]): string {
  if (users.length === 1) {
    return `${users[0].displayName || "Alguém"} está escrevendo`;
  }
  if (users.length === 2) {
    return `${users[0].displayName} e ${users[1].displayName} estão escrevendo`;
  }
  if (users.length >= 3) {
    return `${users[0].displayName}, ${users[1].displayName} e ${users[2].displayName} estão escrevendo`;
  }
  return "";
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  return (
    <AnimatePresence>
      {users.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="flex items-center gap-2 px-4 py-1"
        >
          <div className="flex -space-x-1">
            {users.slice(0, 3).map((user) => (
              <div
                key={user.userId}
                className="w-6 h-6 rounded-full bg-muted border-2 border-background overflow-hidden flex-shrink-0"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                    {(user.displayName || "?")[0].toUpperCase()}
                  </div>
                )}
              </div>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatTypingText(users)}
            <TypingDots />
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
