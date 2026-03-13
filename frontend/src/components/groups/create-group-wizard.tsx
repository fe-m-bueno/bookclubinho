"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateGroupForm } from "./create-group-form";
import { GroupCreatedCelebration } from "./group-created-celebration";
import type { GroupCreateResponse } from "@/lib/types/group";

type WizardState =
  | { phase: "form" }
  | { phase: "celebration"; data: GroupCreateResponse };

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

const contentVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

export function CreateGroupWizard() {
  const [state, setState] = useState<WizardState>({ phase: "form" });
  const shouldReduceMotion = useReducedMotion();
  const noMotion = shouldReduceMotion ?? false;

  function handleSuccess(data: GroupCreateResponse) {
    setState({ phase: "celebration", data });
  }

  const phaseMotionProps = noMotion
    ? {}
    : {
        variants: contentVariants,
        initial: "enter" as const,
        exit: "exit" as const,
        transition: { type: "spring" as const, stiffness: 400, damping: 32 },
      };

  return (
    <motion.div
      variants={cardVariants}
      initial={noMotion ? "visible" : "hidden"}
      animate="visible"
      transition={
        noMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 380, damping: 30 }
      }
      className="w-full max-w-lg"
    >
      <Card>
        <CardHeader>
          {state.phase === "form" && (
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted transition-colors"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <CardTitle>Criar clube</CardTitle>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {state.phase === "form" && (
              <motion.div key="form" animate="center" {...phaseMotionProps}>
                <CreateGroupForm onSuccess={handleSuccess} />
              </motion.div>
            )}

            {state.phase === "celebration" && (
              <motion.div
                key="celebration"
                animate="center"
                {...phaseMotionProps}
              >
                <GroupCreatedCelebration
                  groupId={state.data.id}
                  groupName={state.data.name}
                  inviteCode={state.data.invite_code}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
