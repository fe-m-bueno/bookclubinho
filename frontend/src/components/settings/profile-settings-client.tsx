"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { useCurrentUser } from "@/hooks/use-current-user";
import { USERNAME_REGEX } from "@/hooks/use-username-check";
import { ProfileSettingsSkeleton } from "./profile-settings-skeleton";
import { ProfileAvatarUpload } from "./profile-avatar-upload";
import { queryKeys } from "@/lib/query-keys";
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
import { ApiError, api, errorMessage } from "@/lib/api";
import type { UserMe } from "@/lib/types/user";
import { AUTH_PROVIDER_LABELS } from "@/lib/auth-provider-labels";
import { formatReadingTime } from "@/lib/reading-time";

const schema = z.object({
  display_name: z.string().trim().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres"),
  username: z
    .string()
    .trim()
    .regex(
      USERNAME_REGEX,
      "Deve começar com letra, ter de 3 a 20 caracteres e usar apenas letras, números e _",
    ),
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

/**
 * O form só monta com o usuário em mão.
 *
 * Antes era um `useForm` sem `defaultValues` mais um `reset()` num `useEffect`,
 * e a tela não podia ser salva no primeiro carregamento. O `Select` de fuso do
 * Radix montava com `value` `undefined` — descontrolado — e o `reset` chegava
 * depois. Pior: dando `defaultValues` com `timezone: ""`, o Select montava
 * controlado com `""` e, quando o `reset` mudava o prop, **devolvia o `""`
 * antigo pelo `onValueChange`**, que caía no `setValue` e apagava o valor. Os
 * dois caminhos terminavam igual: `timezone: z.string().min(1)` reprovava, o
 * `handleSubmit` nunca chamava o `onSubmit`, e o botão não dava sinal — a
 * mensagem ficava no rodapé do form, longe de quem clicou.
 *
 * Sem a corrida não há o que sincronizar: `defaultValues` sai do `user` no
 * primeiro render e o Select nasce controlado com o valor certo.
 *
 * De quebra, sai um efeito colateral que ninguém pediu: o `reset` antigo
 * disparava a cada identidade nova de `user`, então um refetch de
 * `currentUser` — o upload de avatar faz um — apagava o que a pessoa estava
 * digitando.
 */
export function ProfileSettingsClient() {
  const { data: user, isLoading } = useCurrentUser();
  const { showSkeleton } = useSkeletonState(isLoading);

  if (showSkeleton) return <ProfileSettingsSkeleton />;
  if (!user) return null;

  return <ProfileForm user={user} />;
}

function ProfileForm({ user }: { user: UserMe }) {
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
    defaultValues: {
      display_name: user.display_name ?? "",
      username: user.username ?? "",
      status_text: user.status_text ?? "",
      preferred_genres: user.preferred_genres,
      timezone: user.timezone,
    },
  });

  const username = watch("username") ?? "";
  const statusText = watch("status_text") ?? "";
  const selectedGenres = watch("preferred_genres") ?? [];

  async function onSubmit(values: FormValues) {
    try {
      const updated = await api.patch<UserMe>("/users/me", {
        display_name: values.display_name,
        username: values.username,
        status_text: values.status_text || null,
        preferred_genres: values.preferred_genres,
        timezone: values.timezone,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.user.me() });
      reset({
        display_name: updated.display_name ?? "",
        username: updated.username ?? "",
        status_text: updated.status_text ?? "",
        preferred_genres: updated.preferred_genres,
        timezone: updated.timezone,
      });
      toast.success("Perfil atualizado!");
    } catch (err) {
      // 409 tem rótulo próprio porque o backend não diz qual username colidiu.
      // O 422 do FastAPI já é desembrulhado pelo cliente, que devolve a primeira
      // mensagem de validação em `detail`.
      if (err instanceof ApiError && err.status === 409) {
        toast.error("Nome de usuário já está em uso.");
      } else {
        toast.error(errorMessage(err));
      }
    }
  }

  const initials = getInitials(user.display_name, user.username, user.email);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Card 1: Avatar */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5">
        <ProfileAvatarUpload avatarUrl={user.avatar_url} initials={initials} />
      </div>

      {/* Card 2: Profile info */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-5">
        <h2 className="type-title">Informações do perfil</h2>

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
            <span className="type-micro absolute bottom-2 right-3">
              {statusText.length}/100
            </span>
          </div>
        </FormField>

        <div className="space-y-2">
          {/* O primitivo `Label`, e não um papel da rampa: os campos acima
              tiram o rótulo dele, e 15px aqui deixaria este 1px fora dos
              vizinhos — o defeito que a rampa existe para tirar. */}
          <Label>Gêneros favoritos</Label>
          {errors.preferred_genres && (
            <p className="type-meta text-destructive">{errors.preferred_genres.message}</p>
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
                  <div className="type-micro px-2 py-1 font-semibold uppercase tracking-wide">
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
        <h2 className="type-title">Informações da conta</h2>
        <div className="type-body flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">E-mail:</span>
          <span className="font-medium">{user.email}</span>
        </div>
        <div className="type-body flex items-center gap-2">
          <span className="text-muted-foreground">Método de login:</span>
          <Badge variant="secondary">
            {AUTH_PROVIDER_LABELS[user.auth_provider] ?? user.auth_provider}
          </Badge>
        </div>
        <div className="type-meta">
          Membro desde{" "}
          <span className="text-foreground font-medium">
            {format(new Date(user.created_at), "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
        </div>
      </div>

      {/* Card 4: Stats (read-only) */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-3">
        <h2 className="type-title">Estatísticas</h2>
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
      <span className="type-micro">{label}</span>
      <span className="type-body font-semibold">{value}</span>
    </div>
  );
}
