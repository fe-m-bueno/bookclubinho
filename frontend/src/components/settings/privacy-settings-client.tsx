"use client";

import { useReducer, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useRequestDataExport, useDeleteAccount } from "@/hooks/use-data-export";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PrivacySettingsSkeleton } from "./privacy-settings-skeleton";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EXPORT_COOLDOWN_KEY = "data_export_cooldown";

// ── Data export card ──────────────────────────────────────────────────────────

function DataExportCard() {
  const exportMutation = useRequestDataExport();
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  // On mount: read cooldown from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(EXPORT_COOLDOWN_KEY);
    if (stored) {
      const until = new Date(stored);
      if (until > new Date()) {
        setCooldownUntil(until);
      } else {
        localStorage.removeItem(EXPORT_COOLDOWN_KEY);
      }
    }
  }, []);

  // Update countdown every second while in cooldown
  useEffect(() => {
    if (!cooldownUntil) {
      setTimeLeft(null);
      return;
    }

    function updateLeft() {
      if (!cooldownUntil) return;
      const diff = cooldownUntil.getTime() - Date.now();
      if (diff <= 0) {
        setCooldownUntil(null);
        setTimeLeft(null);
        localStorage.removeItem(EXPORT_COOLDOWN_KEY);
        return;
      }
      const hours = Math.floor(diff / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1_000);
      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    }

    updateLeft();
    const interval = setInterval(updateLeft, 1_000);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  async function handleExport() {
    try {
      const result = await exportMutation.mutateAsync();
      toast.success("Solicitacao enviada! Voce recebera um e-mail em breve.");
      if (result.cooldown_until) {
        const until = new Date(result.cooldown_until);
        setCooldownUntil(until);
        localStorage.setItem(EXPORT_COOLDOWN_KEY, result.cooldown_until);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao solicitar exportacao.",
      );
    }
  }

  const inCooldown = cooldownUntil !== null && cooldownUntil > new Date();

  return (
    <div className="bg-card rounded-2xl shadow-sm p-5 space-y-3">
      <h2 className="font-semibold text-base">Exportar meus dados</h2>
      <p className="text-sm text-muted-foreground">
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
            ? `Disponivel em ${timeLeft}`
            : "Solicitar exportacao"}
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
      toast.success("Conta excluida.");
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
        <h2 className="font-semibold text-base text-destructive">
          Excluir minha conta
        </h2>
        <p className="text-sm text-muted-foreground">
          Esta acao e permanente e nao pode ser desfeita.
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
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Ao excluir sua conta:
                </p>
                <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                  <li>Seu nome e foto serao anonimizados</li>
                  <li>Voce perdera acesso imediatamente</li>
                  <li>
                    Dados de leitura serao mantidos de forma anonimizada para
                    estatisticas do clube
                  </li>
                  <li>Esta acao nao pode ser desfeita</li>
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
                <DialogTitle>Confirmar exclusao</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
                  Digite sua senha atual para confirmar a exclusao da conta.
                </p>
                <div className="space-y-1.5">
                  <label
                    htmlFor="delete-password"
                    className="text-sm font-medium"
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

  if (isLoading || !user) return <PrivacySettingsSkeleton />;

  return (
    <div className="space-y-4">
      <DataExportCard />
      <DeleteAccountCard authProvider={user.auth_provider} />
    </div>
  );
}
