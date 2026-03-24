"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Globe, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";

import {
  useSessions,
  useRevokeSession,
  useRevokeAllOtherSessions,
} from "@/hooks/use-sessions";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { SessionsSettingsSkeleton } from "./sessions-settings-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import type { SessionItem } from "@/lib/types/session";

// ── Device icon helper ────────────────────────────────────────────────────────

function getDeviceIcon(deviceInfo: string | null) {
  if (!deviceInfo) return <Globe className="h-5 w-5" />;
  const lower = deviceInfo.toLowerCase();
  if (
    lower.includes("android") ||
    lower.includes("iphone") ||
    lower.includes("ios") ||
    lower.includes("mobile")
  ) {
    return <Smartphone className="h-5 w-5" />;
  }
  if (
    lower.includes("windows") ||
    lower.includes("mac") ||
    lower.includes("linux") ||
    lower.includes("chrome") ||
    lower.includes("firefox") ||
    lower.includes("safari")
  ) {
    return <Monitor className="h-5 w-5" />;
  }
  return <Globe className="h-5 w-5" />;
}

// ── Session card ──────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: SessionItem;
}

function SessionCard({ session }: SessionCardProps) {
  const [revokeOpen, setRevokeOpen] = useState(false);
  const revokeMutation = useRevokeSession();

  async function handleRevoke() {
    try {
      await revokeMutation.mutateAsync(session.id);
      toast.success("Sessão encerrada.");
      setRevokeOpen(false);
    } catch {
      toast.error("Erro ao revogar sessão. Tente novamente.");
    }
  }

  const lastActive = formatDistanceToNow(new Date(session.last_active_at), {
    locale: ptBR,
    addSuffix: true,
  });

  return (
    <>
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
          {getDeviceIcon(session.device_info)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">
              {session.device_info ?? "Dispositivo desconhecido"}
            </span>
            {session.is_current && (
              <Badge
                variant="outline"
                className="text-xs border-green-500 text-green-600 dark:text-green-400"
              >
                Sessão atual
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {session.ip_address ?? "IP desconhecido"} &middot; Ultima atividade:{" "}
            {lastActive}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={session.is_current || revokeMutation.isPending}
          onClick={() => setRevokeOpen(true)}
          className="shrink-0"
        >
          Revogar
        </Button>
      </div>

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta sessão sera encerrada imediatamente. O dispositivo precisara
              fazer login novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleRevoke()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SessionsSettingsClient() {
  const { data, isLoading } = useSessions();
  const revokeAllMutation = useRevokeAllOtherSessions();
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);

  const { showSkeleton } = useSkeletonState(isLoading);
  if (showSkeleton) return <SessionsSettingsSkeleton />;

  const sessions = data?.sessions ?? [];
  const hasOtherSessions = sessions.length > 1;

  async function handleRevokeAll() {
    try {
      await revokeAllMutation.mutateAsync();
      toast.success("Todas as outras sessoes foram encerradas.");
      setRevokeAllOpen(false);
    } catch {
      toast.error("Erro ao revogar sessoes. Tente novamente.");
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-card rounded-2xl shadow-warm-sm p-8 text-center space-y-2">
        <Monitor className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          Nenhuma sessao ativa encontrada.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>

      {hasOtherSessions && (
        <div className="mt-4">
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={() => setRevokeAllOpen(true)}
            disabled={revokeAllMutation.isPending}
          >
            Encerrar todas as outras sessoes
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center mt-4">
        Revogar sessoes encerra o acesso em outros dispositivos.
      </p>

      <AlertDialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar outras sessoes?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as sessoes, exceto a atual, serao encerradas. Outros
              dispositivos precisarao fazer login novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleRevokeAll()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Encerrar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
