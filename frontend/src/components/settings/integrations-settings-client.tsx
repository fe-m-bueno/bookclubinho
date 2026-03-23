"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";

import {
  useHardcoverStatus,
  useConnectHardcover,
  useDisconnectHardcover,
  useToggleHardcoverSync,
} from "@/hooks/use-hardcover-status";
import { useCurrentUser } from "@/hooks/use-current-user";
import { IntegrationsSettingsSkeleton } from "./integrations-settings-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Future integration card ───────────────────────────────────────────────────

interface FutureIntegrationCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
}

function FutureIntegrationCard({
  name,
  description,
  icon,
}: FutureIntegrationCardProps) {
  return (
    <div className="bg-card rounded-2xl shadow-warm-sm p-5 opacity-60">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{name}</span>
            <Badge variant="secondary" className="text-xs">
              Em breve
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Hardcover card ────────────────────────────────────────────────────────────

function HardcoverCard() {
  const { data: status, isLoading: statusLoading } = useHardcoverStatus();
  const { data: user } = useCurrentUser();
  const connectMutation = useConnectHardcover();
  const disconnectMutation = useDisconnectHardcover();
  const syncMutation = useToggleHardcoverSync();

  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [token, setToken] = useState("");

  const isConnected = status?.connected ?? false;
  const hardcoverUsername = status?.hardcover_username;
  const autoSync = user?.auto_sync_hardcover ?? false;

  async function handleConnect() {
    if (!token.trim()) return;
    try {
      await connectMutation.mutateAsync(token.trim());
      toast.success("Hardcover conectado com sucesso!");
      setConnectOpen(false);
      setToken("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conectar");
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectMutation.mutateAsync();
      toast.success("Hardcover desconectado.");
      setDisconnectOpen(false);
    } catch {
      toast.error("Erro ao desconectar. Tente novamente.");
    }
  }

  async function handleSyncToggle(enabled: boolean) {
    try {
      await syncMutation.mutateAsync(enabled);
      toast.success(
        enabled ? "Sincronização automática ativada." : "Sincronização automática desativada.",
      );
    } catch {
      toast.error("Erro ao atualizar configuração.");
    }
  }

  return (
    <>
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Hardcover</span>
              {!statusLoading && (
                <span className="flex items-center gap-1">
                  <span
                    className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-muted-foreground/50"}`}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-muted-foreground">
                    {isConnected
                      ? `Conectado como @${hardcoverUsername ?? "desconhecido"}`
                      : "Não conectado"}
                  </span>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sincronize sua estante do Hardcover
            </p>
          </div>
          {!isConnected ? (
            <Button
              size="sm"
              onClick={() => setConnectOpen(true)}
              disabled={statusLoading}
            >
              Conectar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDisconnectOpen(true)}
              disabled={disconnectMutation.isPending}
            >
              Desconectar
            </Button>
          )}
        </div>

        {isConnected && (
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <div>
              <p className="text-sm font-medium">Sincronização automática</p>
              <p className="text-xs text-muted-foreground">
                Atualizar progresso de leitura automaticamente
              </p>
            </div>
            <Switch
              checked={autoSync}
              onCheckedChange={handleSyncToggle}
              disabled={syncMutation.isPending}
              aria-label="Sincronização automática do Hardcover"
            />
          </div>
        )}
      </div>

      {/* Connect dialog */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar Hardcover</DialogTitle>
            <DialogDescription>
              Para conectar sua conta do Hardcover, acesse{" "}
              <a
                href="https://hardcover.app/account/api"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium text-foreground"
              >
                hardcover.app/account/api
              </a>{" "}
              e copie seu token de API pessoal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="hardcover-token" className="text-sm font-medium">
              Token de API
            </label>
            <Input
              id="hardcover-token"
              type="password"
              placeholder="Cole seu token aqui..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleConnect();
              }}
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setConnectOpen(false);
                setToken("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleConnect()}
              disabled={!token.trim() || connectMutation.isPending}
            >
              {connectMutation.isPending ? "Conectando..." : "Conectar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect alert dialog */}
      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar Hardcover?</AlertDialogTitle>
            <AlertDialogDescription>
              Sua conta do Hardcover será desvinculada. O histórico de
              sincronização será mantido, mas novas atualizações serão
              pausadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDisconnect()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IntegrationsSettingsClient() {
  const { isLoading: statusLoading } = useHardcoverStatus();
  const { isLoading: userLoading } = useCurrentUser();

  if (statusLoading || userLoading) return <IntegrationsSettingsSkeleton />;

  return (
    <div className="space-y-4">
      <HardcoverCard />

      <FutureIntegrationCard
        name="Goodreads"
        description="Importe sua estante e histórico do Goodreads"
        icon={<BookOpen className="h-5 w-5" />}
      />

      <FutureIntegrationCard
        name="Skoob"
        description="Sincronize seus livros lidos do Skoob"
        icon={<BookOpen className="h-5 w-5" />}
      />
    </div>
  );
}
