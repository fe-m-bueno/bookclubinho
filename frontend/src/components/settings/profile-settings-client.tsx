"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { useCurrentUser } from "@/hooks/use-current-user";
import { USERNAME_REGEX } from "@/hooks/use-username-check";
import { ProfileSettingsSkeleton } from "./profile-settings-skeleton";
import { ProfileAvatarUpload } from "./profile-avatar-upload";
import { GenreSelector } from "@/components/shared/genre-selector";
import { UsernameField } from "@/components/onboarding/username-field";
import { FormField } from "@/components/auth/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import { AUTH_PROVIDER_LABELS } from "@/lib/auth-provider-labels";

const schema = z.object({
  display_name: z.string().trim().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres"),
  username: z
    .string()
    .trim()
    .regex(USERNAME_REGEX, "Username deve começar com letra, ter 3-20 chars e usar apenas letras, números e _"),
  status_text: z.string().max(100, "Máximo 100 caracteres").optional(),
  preferred_genres: z.array(z.string()).min(1, "Selecione ao menos 1 gênero"),
  timezone: z.string().min(1, "Selecione um fuso horário"),
});

type FormValues = z.infer<typeof schema>;

// Curated list of common timezones grouped by region
const TIMEZONES = [
  { label: "América do Sul", options: [
    { value: "America/Sao_Paulo", label: "Brasília (UTC-3)" },
    { value: "America/Manaus", label: "Manaus (UTC-4)" },
    { value: "America/Belem", label: "Belém (UTC-3)" },
    { value: "America/Fortaleza", label: "Fortaleza (UTC-3)" },
    { value: "America/Recife", label: "Recife (UTC-3)" },
    { value: "America/Cuiaba", label: "Cuiabá (UTC-4)" },
    { value: "America/Porto_Velho", label: "Porto Velho (UTC-4)" },
    { value: "America/Rio_Branco", label: "Rio Branco (UTC-5)" },
    { value: "America/Buenos_Aires", label: "Buenos Aires (UTC-3)" },
    { value: "America/Santiago", label: "Santiago (UTC-3)" },
    { value: "America/Bogota", label: "Bogotá (UTC-5)" },
    { value: "America/Lima", label: "Lima (UTC-5)" },
  ]},
  { label: "América do Norte", options: [
    { value: "America/New_York", label: "Nova York (UTC-5)" },
    { value: "America/Chicago", label: "Chicago (UTC-6)" },
    { value: "America/Denver", label: "Denver (UTC-7)" },
    { value: "America/Los_Angeles", label: "Los Angeles (UTC-8)" },
    { value: "America/Toronto", label: "Toronto (UTC-5)" },
    { value: "America/Mexico_City", label: "Cidade do México (UTC-6)" },
  ]},
  { label: "Europa", options: [
    { value: "Europe/London", label: "Londres (UTC+0)" },
    { value: "Europe/Lisbon", label: "Lisboa (UTC+0)" },
    { value: "Europe/Paris", label: "Paris (UTC+1)" },
    { value: "Europe/Berlin", label: "Berlim (UTC+1)" },
    { value: "Europe/Madrid", label: "Madri (UTC+1)" },
    { value: "Europe/Rome", label: "Roma (UTC+1)" },
  ]},
  { label: "Ásia / Pacífico", options: [
    { value: "Asia/Tokyo", label: "Tóquio (UTC+9)" },
    { value: "Asia/Shanghai", label: "Xangai (UTC+8)" },
    { value: "Asia/Kolkata", label: "Mumbai (UTC+5:30)" },
    { value: "Australia/Sydney", label: "Sydney (UTC+10)" },
    { value: "Pacific/Auckland", label: "Auckland (UTC+12)" },
  ]},
];

function getInitials(displayName: string | null, username: string | null, email: string) {
  const name = displayName || username || email;
  return name.slice(0, 2).toUpperCase();
}

export function ProfileSettingsClient() {
  const { data: user, isLoading } = useCurrentUser();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (user) {
      reset({
        display_name: user.display_name ?? "",
        username: user.username ?? "",
        status_text: user.status_text ?? "",
        preferred_genres: user.preferred_genres,
        timezone: user.timezone,
      });
    }
  }, [user, reset]);

  const username = watch("username") ?? "";
  const statusText = watch("status_text") ?? "";
  const selectedGenres = watch("preferred_genres") ?? [];

  async function onSubmit(values: FormValues) {
    try {
      await ensureCsrf();
      const res = await fetch("/api/v1/users/me", {
        method: "PATCH",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          display_name: values.display_name,
          username: values.username,
          status_text: values.status_text || null,
          preferred_genres: values.preferred_genres,
          timezone: values.timezone,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        reset({
          display_name: updated.display_name ?? "",
          username: updated.username ?? "",
          status_text: updated.status_text ?? "",
          preferred_genres: updated.preferred_genres,
          timezone: updated.timezone,
        });
        toast.success("Perfil atualizado!");
      } else if (res.status === 409) {
        toast.error("Username já está em uso.");
      } else if (res.status === 422) {
        const body = await res.json();
        const msg = Array.isArray(body.detail)
          ? body.detail.map((e: { msg?: string }) => e.msg).join(", ")
          : (body.detail ?? "Erro de validação");
        toast.error(msg);
      } else {
        toast.error("Erro ao salvar. Tente novamente.");
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    }
  }

  const { showSkeleton } = useSkeletonState(isLoading);
  if (showSkeleton) return <ProfileSettingsSkeleton />;
  if (!user) return null;

  const initials = getInitials(user.display_name, user.username, user.email);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Card 1: Avatar */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5">
        <ProfileAvatarUpload avatarUrl={user.avatar_url} initials={initials} />
      </div>

      {/* Card 2: Profile info */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-5">
        <h2 className="font-semibold text-base">Informações do perfil</h2>

        <FormField label="Nome" htmlFor="display_name" error={errors.display_name?.message}>
          <Input
            id="display_name"
            type="text"
            placeholder="Seu nome"
            {...register("display_name")}
          />
        </FormField>

        <UsernameField
          id="settings-username"
          registration={register("username")}
          error={errors.username}
          username={username}
          currentUsername={user.username ?? undefined}
        />

        <FormField label="Status" htmlFor="status_text" error={errors.status_text?.message}>
          <div className="relative">
            <Textarea
              id="status_text"
              placeholder="Uma frase sobre você..."
              className="resize-none pr-12"
              rows={2}
              maxLength={100}
              {...register("status_text")}
            />
            <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">
              {statusText.length}/100
            </span>
          </div>
        </FormField>

        <div className="space-y-2">
          <span className="text-sm font-medium leading-none">Gêneros favoritos</span>
          {errors.preferred_genres && (
            <p className="text-sm text-destructive">{errors.preferred_genres.message}</p>
          )}
          <GenreSelector
            selected={selectedGenres}
            onChange={(genres) => setValue("preferred_genres", genres, { shouldDirty: true })}
          />
        </div>

        <FormField label="Fuso horário" htmlFor="timezone" error={errors.timezone?.message}>
          <Select
            value={watch("timezone")}
            onValueChange={(v) => setValue("timezone", v, { shouldDirty: true })}
          >
            <SelectTrigger id="timezone">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((group) => (
                <div key={group.label}>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {group.label}
                  </div>
                  {group.options.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      {/* Card 3: Account info (read-only) */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-3">
        <h2 className="font-semibold text-base">Informações da conta</h2>
        <div className="flex items-center gap-2 text-sm">
          <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">E-mail:</span>
          <span className="font-medium">{user.email}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Método de login:</span>
          <Badge variant="secondary">
            {AUTH_PROVIDER_LABELS[user.auth_provider] ?? user.auth_provider}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          Membro desde{" "}
          <span className="text-foreground font-medium">
            {format(new Date(user.created_at), "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
        </div>
      </div>

      {/* Card 4: Stats (read-only) */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-3">
        <h2 className="font-semibold text-base">Estatísticas</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Tempo de leitura"
            value={formatReadingTime(user.total_reading_time_minutes)}
          />
          <StatCard label="Streak atual" value={`${user.streak_current} dias`} />
          <StatCard label="Maior streak" value={`${user.streak_longest} dias`} />
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end pb-4">
        <Button
          type="submit"
          disabled={!isDirty || isSubmitting}
          className="min-w-[140px]"
        >
          {isSubmitting ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-xl p-3 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold text-sm">{value}</span>
    </div>
  );
}

function formatReadingTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}
