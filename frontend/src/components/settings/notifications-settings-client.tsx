"use client";

import { Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Switch } from "@/components/ui/switch";
import { NotificationsSettingsSkeleton } from "./notifications-settings-skeleton";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import type { EmailNotificationPreferences, UserMe } from "@/lib/types/user";

interface NotificationToggle {
  key: keyof Omit<EmailNotificationPreferences, "auth">;
  label: string;
  description: string;
}

const TOGGLES: NotificationToggle[] = [
  {
    key: "meetings",
    label: "Encontros",
    description: "Lembretes de encontros do clube 24h e 1h antes",
  },
  {
    key: "invites",
    label: "Convites",
    description: "Quando alguém te convidar para um clube",
  },
  {
    key: "approaching_end",
    label: "Quase terminando",
    description: "Quando um membro do clube está quase terminando o livro",
  },
  {
    key: "all_updates",
    label: "Novidades do clube",
    description: "Digest com novas mensagens no chat do clube",
  },
];

export function NotificationsSettingsClient() {
  const { data: user, isLoading } = useCurrentUser();
  const queryClient = useQueryClient();

  const { showSkeleton } = useSkeletonState(isLoading);
  if (showSkeleton) return <NotificationsSettingsSkeleton />;
  if (!user) return null;

  const prefs = user.email_notifications;

  async function handleToggle(
    key: keyof Omit<EmailNotificationPreferences, "auth">,
    newValue: boolean,
  ) {
    // Optimistic update
    const prevUser = queryClient.getQueryData<UserMe>(["currentUser"]);
    queryClient.setQueryData<UserMe>(["currentUser"], (old) => {
      if (!old) return old;
      return {
        ...old,
        email_notifications: {
          ...old.email_notifications,
          [key]: newValue,
        },
      };
    });

    try {
      await ensureCsrf();
      const res = await fetch("/api/v1/users/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: withCsrf({ "Content-Type": "application/json" }),
        body: JSON.stringify({ [key]: newValue }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar preferência");

      toast.success(
        newValue ? "Notificação ativada." : "Notificação desativada.",
      );
    } catch {
      // Rollback
      queryClient.setQueryData<UserMe>(["currentUser"], prevUser);
      toast.error("Erro ao atualizar preferência. Tente novamente.");
    }
  }

  return (
    <div className="space-y-3">
      {TOGGLES.map((toggle) => (
        <div key={toggle.key} className="bg-card rounded-2xl shadow-warm-sm p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{toggle.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {toggle.description}
              </p>
            </div>
            <Switch
              checked={prefs[toggle.key]}
              onCheckedChange={(val) => void handleToggle(toggle.key, val)}
              aria-label={toggle.label}
            />
          </div>
        </div>
      ))}

      {/* Auth toggle — always enabled, cannot be disabled */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 opacity-70">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium">E-mails de segurança</p>
              <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verificação de e-mail, magic links e exportação de dados (obrigatório)
            </p>
          </div>
          <Switch
            checked
            disabled
            aria-label="E-mails de segurança (obrigatório)"
          />
        </div>
      </div>
    </div>
  );
}
