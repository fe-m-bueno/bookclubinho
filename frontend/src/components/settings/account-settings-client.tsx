"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { useCurrentUser } from "@/hooks/use-current-user";
import { AccountSettingsSkeleton } from "./account-settings-skeleton";
import { FormField } from "@/components/auth/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import { AUTH_PROVIDER_LABELS } from "@/lib/auth-provider-labels";

// ── Password form ─────────────────────────────────────────────────────────────

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Informe a senha atual"),
    new_password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "As senhas não coincidem",
    path: ["confirm_password"],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

function ChangePasswordCard({ authProvider }: { authProvider: string }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  if (authProvider !== "local") {
    return (
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-3">
        <h2 className="font-semibold text-base">Alterar senha</h2>
        <p className="text-sm text-muted-foreground">
          Sua conta usa{" "}
          <span className="font-medium text-foreground">
            {authProvider === "google" ? "Google" : "Magic Link"}
          </span>{" "}
          para autenticação. Troca de senha não está disponível.
        </p>
      </div>
    );
  }

  async function onSubmit(values: PasswordFormValues) {
    try {
      await ensureCsrf();
      const res = await fetch("/api/v1/auth/password", {
        method: "PATCH",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          current_password: values.current_password,
          new_password: values.new_password,
        }),
      });

      if (res.ok) {
        reset();
        toast.success("Senha alterada!");
      } else if (res.status === 403) {
        toast.error("Conta não usa senha.");
      } else if (res.status === 400) {
        toast.error("Senha atual incorreta.");
      } else {
        toast.error("Erro ao alterar senha. Tente novamente.");
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-5">
      <h2 className="font-semibold text-base">Alterar senha</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Senha atual" htmlFor="current_password" error={errors.current_password?.message}>
          <PasswordInput id="current_password" autoComplete="current-password" {...register("current_password")} />
        </FormField>
        <FormField label="Nova senha" htmlFor="new_password" error={errors.new_password?.message}>
          <PasswordInput id="new_password" autoComplete="new-password" {...register("new_password")} />
        </FormField>
        <FormField label="Confirmar nova senha" htmlFor="confirm_password" error={errors.confirm_password?.message}>
          <PasswordInput id="confirm_password" autoComplete="new-password" {...register("confirm_password")} />
        </FormField>
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
            {isSubmitting ? "Salvando..." : "Alterar senha"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Email form ────────────────────────────────────────────────────────────────

const emailSchema = z.object({
  new_email: z.string().email("E-mail inválido"),
  current_password: z.string().optional(),
});

type EmailFormValues = z.infer<typeof emailSchema>;

function ChangeEmailCard({
  currentEmail,
  authProvider,
}: {
  currentEmail: string;
  authProvider: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmailFormValues>({ resolver: zodResolver(emailSchema) });

  async function onSubmit(values: EmailFormValues) {
    try {
      await ensureCsrf();
      const res = await fetch("/api/v1/auth/email", {
        method: "PATCH",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          new_email: values.new_email,
          current_password: values.current_password || null,
        }),
      });

      if (res.ok) {
        reset();
        setExpanded(false);
        toast.success(`E-mail de confirmação enviado para ${values.new_email}.`);
      } else if (res.status === 400) {
        toast.error("Senha atual incorreta.");
      } else if (res.status === 409) {
        toast.error("E-mail já está em uso.");
      } else {
        toast.error("Erro ao solicitar troca de e-mail.");
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    }
  }

  return (
    <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-4">
      <h2 className="font-semibold text-base">E-mail</h2>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{currentEmail}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm font-medium text-primary flex items-center gap-1"
        >
          Alterar e-mail
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="email-form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <FormField label="Novo e-mail" htmlFor="new_email" error={errors.new_email?.message}>
                <Input
                  id="new_email"
                  type="email"
                  placeholder="novo@email.com"
                  autoComplete="email"
                  {...register("new_email")}
                />
              </FormField>

              {authProvider === "local" && (
                <FormField
                  label="Senha atual"
                  htmlFor="email_current_password"
                  error={errors.current_password?.message}
                >
                  <PasswordInput
                    id="email_current_password"
                    autoComplete="current-password"
                    {...register("current_password")}
                  />
                </FormField>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setExpanded(false); reset(); }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Enviando..." : "Enviar confirmação"}
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Auth provider card ────────────────────────────────────────────────────────

function AuthProviderCard({ authProvider }: { authProvider: string }) {
  return (
    <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-3">
      <h2 className="font-semibold text-base">Método de login</h2>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          {AUTH_PROVIDER_LABELS[authProvider] ?? authProvider}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {authProvider === "local" && "Login via e-mail e senha"}
          {authProvider === "google" && "Login via conta Google"}
          {authProvider === "magic_link" && "Login via magic link no e-mail"}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AccountSettingsClient() {
  const { data: user, isLoading } = useCurrentUser();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("email_changed") === "true") {
      toast.success("E-mail alterado com sucesso!");
    }
    if (searchParams.get("email_error") === "true") {
      toast.error("Link de confirmação inválido ou expirado.");
    }
  }, [searchParams]);

  if (isLoading || !user) return <AccountSettingsSkeleton />;

  return (
    <div className="space-y-4">
      <AuthProviderCard authProvider={user.auth_provider} />
      <ChangePasswordCard authProvider={user.auth_provider} />
      <ChangeEmailCard currentEmail={user.email} authProvider={user.auth_provider} />
    </div>
  );
}
