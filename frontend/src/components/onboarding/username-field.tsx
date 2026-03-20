"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { FormField } from "@/components/auth/form-field";
import { useUsernameCheck, type UsernameStatus } from "@/hooks/use-username-check";

interface UsernameFieldProps {
  registration: UseFormRegisterReturn<"username">;
  error?: FieldError;
  username: string;
  /** If the typed username equals currentUsername, skip availability check. */
  currentUsername?: string;
  onStatusChange?: (status: UsernameStatus) => void;
  /** HTML id for the input (defaults to "onboarding-username" for backward compat). */
  id?: string;
}

const iconVariants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.5 },
};

const iconTransition = { type: "spring" as const, stiffness: 500, damping: 28 };

export function UsernameField({
  registration,
  error,
  username,
  currentUsername,
  onStatusChange,
  id = "onboarding-username",
}: UsernameFieldProps) {
  // Skip check when user hasn't changed their own username
  const usernameToCheck =
    currentUsername && username.toLowerCase() === currentUsername.toLowerCase() ? "" : username;

  const { status } = useUsernameCheck(usernameToCheck);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const showTaken = status === "taken" && !error;

  return (
    <FormField
      label="Username"
      htmlFor={id}
      error={error?.message ?? (showTaken ? "Username já está em uso" : undefined)}
    >
      <div className="relative">
        <Input
          id={id}
          type="text"
          placeholder="seu_username"
          autoComplete="username"
          {...registration}
        />
        <div
          className="absolute right-3 top-1/2 -translate-y-1/2"
          aria-live="polite"
        >
          <AnimatePresence mode="wait">
            {status === "checking" && (
              <motion.div
                key="checking"
                variants={iconVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={iconTransition}
              >
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </motion.div>
            )}
            {status === "available" && !error && (
              <motion.div
                key="available"
                variants={iconVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={iconTransition}
              >
                <Check className="h-4 w-4 text-green-500" />
              </motion.div>
            )}
            {status === "taken" && !error && (
              <motion.div
                key="taken"
                variants={iconVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={iconTransition}
              >
                <X className="h-4 w-4 text-destructive" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </FormField>
  );
}
