"use client";

import { useReducer, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useRequestDataExport, useDeleteAccount } from "@/hooks/use-data-export";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { useCountdown } from "@/hooks/use-countdown";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatCountdown } from "@/lib/format-countdown";
import { PrivacySettingsSkeleton } from "./privacy-settings-skeleton";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EXPORT_COOLDOWN_KEY = "data_export_cooldown";

// ── Data export card ──────────────────────────────────────────────────────────

function DataExportCard() {
  const exportMutation = useRequestDataExport();
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  const remainingMs = useCountdown(cooldownUntil);
  const inCooldown = remainingMs > 0;
  const timeLeft = inCooldown ? formatCountdown(remainingMs) : null;

  // On mount: read cooldown from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(EXPORT_COOLDOWN_KEY);
    if (!stored) return;
    const until = new Date(stored).getTime();
    if (until > Date.now()) {
      setCooldownUntil(until);
    } else {
      localStorage.removeItem(EXPORT_COOLDOWN_KEY);
    }
  }, []);

  // Prazo vencido: a chave no localStorage não serve mais para nada.
  useEffect(() => {
    if (cooldownUntil !== null && remainingMs === 0) {
      setCooldownUntil(null);
      localStorage.removeItem(EXPORT_COOLDOWN_KEY);
    }
  }, [cooldownUntil, remainingMs]);

  async function handleExport() {
    try {
      const result = await exportMutation.mutateAsync();
      toast.success("Solicitação enviada! Você receberá um e-mail em breve.");
      if (result.cooldown_until) {
        setCooldownUntil(new Date(result.cooldown_until).getTime());
        localStorage.setItem(EXPORT_COOLDOWN_KEY, result.cooldown_until);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao solicitar exportação.",
      );
    }
  }

  return (
    <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-3">
      <h2 className="type-title">Exportar meus dados</h2>
      <p className="type-meta">
        Receba um arquivo com todos os seus dados: perfil, grupos, progresso,
        reviews e badges.
      </p>
      <Button
        onClick={() => void handleExport()}
        disabled={inCooldown || exportMutation.isPending}
        variant="outline"
      >
        {exportMutation.isPending
          ? "Solicitando..."
          : inCooldown && timeLeft
            ? `Disponível em ${timeLeft}`
            : "Solicitar exportação"}
      </Button>
    </div>
  );
}

// ── Delete account dialog state ───────────────────────────────────────────────

type DialogState = {
  open: boolean;
  step: 1 | 2 | 3;
  confirmInput: string;
  password: string;
};

type DialogAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "set_step"; step: 1 | 2 | 3 }
  | { type: "set_confirm"; value: string }
  | { type: "set_password"; value: string };

const DIALOG_INITIAL: DialogState = { open: false, step: 1, confirmInput: "", password: "" };

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case "open": return { ...DIALOG_INITIAL, open: true };
    case "close": return DIALOG_INITIAL;
    case "set_step": return { ...state, step: action.step };
    case "set_confirm": return { ...state, confirmInput: action.value };
    case "set_password": return { ...state, password: action.value };
  }
}

// ── Delete account card ───────────────────────────────────────────────────────

function DeleteAccountCard({ authProvider }: { authProvider: string }) {
  const router = useRouter();
  const deleteMutation = useDeleteAccount();
  const [dialog, dispatch] = useReducer(dialogReducer, DIALOG_INITIAL);

  function handleOpenChange(next: boolean) {
    dispatch(next ? { type: "open" } : { type: "close" });
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync({
        confirmation: "EXCLUIR",
        current_password:
          authProvider === "local" ? dialog.password : undefined,
      });
      toast.success("Conta excluída.");
      router.push("/auth/login");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao excluir conta.",
      );
    }
  }

  function handleStep2Continue() {
    if (authProvider === "local") {
      dispatch({ type: "set_step", step: 3 });
    } else {
      void handleDelete();
    }
  }

  return (
    <>
      <div className="border border-destructive/30 bg-destructive/5 rounded-2xl p-5 space-y-3">
        <h2 className="type-title text-destructive">
          Excluir minha conta
        </h2>
        <p className="type-meta">
          Esta ação é permanente e não pode ser desfeita.
        </p>
        <Button
          variant="destructive"
          onClick={() => dispatch({ type: "open" })}
        >
          Excluir conta
        </Button>
      </div>

      <Dialog open={dialog.open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          {dialog.step === 1 && (
            <>
              <DialogHeader>
                <DialogTitle>Excluir conta</DialogTitle>
                <DialogDescription>
                  Leia o que se perde antes de continuar. Não há como desfazer.
                </DialogDescription>
              </DialogHeader>
              <div className="type-body space-y-3">
                <p className="text-muted-foreground">
                  Ao excluir sua conta:
                </p>
                <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                  <li>Seu nome e foto serão anonimizados</li>
                  <li>Você perderá acesso imediatamente</li>
                  <li>
                    Dados de leitura serão mantidos de forma anonimizada para
                    estatísticas do clube
                  </li>
                  <li>Esta ação não pode ser desfeita</li>
                </ul>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => dispatch({ type: "set_step", step: 2 })}
                >
                  Continuar
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog.step === 2 && (
            <>
              <DialogHeader>
                <DialogTitle>Confirmar exclusão</DialogTitle>
                <DialogDescription>
                  Digite sua senha para confirmar a exclusão da conta.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <p className="type-meta">
                  Digite{" "}
                  <span className="font-mono font-bold text-foreground">
                    EXCLUIR
                  </span>{" "}
                  para confirmar:
                </p>
                <Input
                  value={dialog.confirmInput}
                  onChange={(e) =>
                    dispatch({ type: "set_confirm", value: e.target.value })
                  }
                  placeholder="EXCLUIR"
                  autoComplete="off"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => dispatch({ type: "set_step", step: 1 })}
                >
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  disabled={
                    dialog.confirmInput !== "EXCLUIR" ||
                    deleteMutation.isPending
                  }
                  onClick={handleStep2Continue}
                >
                  {deleteMutation.isPending && authProvider !== "local"
                    ? "Excluindo..."
                    : "Continuar"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog.step === 3 && authProvider === "local" && (
            <>
              <DialogHeader>
                <DialogTitle>Confirmar senha</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="type-meta">
                  Digite sua senha atual para confirmar a exclusão da conta.
                </p>
                <div className="space-y-1.5">
                  <label
                    htmlFor="delete-password"
                    className="type-body"
                  >
                    Senha atual
                  </label>
                  <PasswordInput
                    id="delete-password"
                    value={dialog.password}
                    onChange={(e) =>
                      dispatch({ type: "set_password", value: e.target.value })
                    }
                    autoComplete="current-password"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && dialog.password.length > 0) {
                        void handleDelete();
                      }
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => dispatch({ type: "set_step", step: 2 })}
                >
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  disabled={!dialog.password || deleteMutation.isPending}
                  onClick={() => void handleDelete()}
                >
                  {deleteMutation.isPending
                    ? "Excluindo..."
                    : "Excluir permanentemente"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PrivacySettingsClient() {
  const { data: user, isLoading } = useCurrentUser();

  const { showSkeleton } = useSkeletonState(isLoading);
  if (showSkeleton) return <PrivacySettingsSkeleton />;
  if (!user) return null;

  return (
    <div className="space-y-4">
      <DataExportCard />
      <DeleteAccountCard authProvider={user.auth_provider} />
    </div>
  );
}
