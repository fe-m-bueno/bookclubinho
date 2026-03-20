"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus, Users, BookOpen } from "lucide-react";
import { JoinGroupDialog } from "./join-group-dialog";

interface SpeedDialFABProps {
  onCreateGroup?: () => void;
}

export function SpeedDialFAB({ onCreateGroup }: SpeedDialFABProps) {
  const [open, setOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const shouldReduce = useReducedMotion();
  const router = useRouter();

  const fabActions = [
    {
      icon: Users,
      label: "Novo clube",
      onClick: () => {
        setOpen(false);
        if (onCreateGroup) {
          onCreateGroup();
        } else {
          router.push("/groups/new");
        }
      },
    },
    {
      icon: BookOpen,
      label: "Entrar com código",
      onClick: () => {
        setOpen(false);
        setJoinOpen(true);
      },
    },
  ];

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-3">
        <AnimatePresence>
          {open &&
            fabActions.map((action, i) => (
              <motion.button
                key={action.label}
                type="button"
                initial={
                  shouldReduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.8 }
                }
                animate={
                  shouldReduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
                }
                exit={
                  shouldReduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.8 }
                }
                transition={{ duration: shouldReduce ? 0 : 0.15, delay: i * 0.05 }}
                onClick={action.onClick}
                className="flex min-h-[44px] items-center gap-2 rounded-full bg-card px-4 py-2 shadow-lg ring-1 ring-border transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={action.label}
              >
                <action.icon className="h-4 w-4 shrink-0 text-foreground" />
                <span className="whitespace-nowrap text-sm font-medium text-foreground">
                  {action.label}
                </span>
              </motion.button>
            ))}
        </AnimatePresence>

        {/* Main FAB button */}
        <motion.button
          type="button"
          onClick={() => setOpen((v) => !v)}
          animate={open ? { rotate: 45 } : { rotate: 0 }}
          transition={{ duration: shouldReduce ? 0 : 0.2 }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={open ? "Fechar menu" : "Novo clube ou entrar"}
          aria-expanded={open}
        >
          <Plus className="h-6 w-6" />
        </motion.button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <JoinGroupDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </>
  );
}
