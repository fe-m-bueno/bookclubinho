"use client";

import { useEffect } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { FormField } from "@/components/auth/form-field";
import { useUsernameCheck, type UsernameStatus } from "@/hooks/use-username-check";

interface UsernameFieldProps {
  registration: UseFormRegisterReturn<"username">;
  error?: FieldError;
  username: string;
  onStatusChange?: (status: UsernameStatus) => void;
}

export function UsernameField({ registration, error, username, onStatusChange }: UsernameFieldProps) {
  const { status } = useUsernameCheck(username);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const showTaken = status === "taken" && !error;

  return (
    <FormField
      label="Username"
      htmlFor="onboarding-username"
      error={error?.message ?? (showTaken ? "Username já está em uso" : undefined)}
    >
      <div className="relative">
        <Input
          id="onboarding-username"
          type="text"
          placeholder="seu_username"
          autoComplete="username"
          {...registration}
        />
        <div
          className="absolute right-3 top-1/2 -translate-y-1/2"
          aria-live="polite"
        >
          {status === "checking" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {status === "available" && !error && (
            <Check className="h-4 w-4 text-green-500" />
          )}
          {status === "taken" && !error && (
            <X className="h-4 w-4 text-destructive" />
          )}
        </div>
      </div>
    </FormField>
  );
}
