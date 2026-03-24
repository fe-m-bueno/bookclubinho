"use client";

import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookOpen, Flame, Home, Trophy, Users } from "lucide-react";

import { usePublicProfile } from "@/hooks/use-public-profile";
import { useSharedGroups } from "@/hooks/use-shared-groups";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { UserProfileSkeleton } from "./user-profile-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatReadingTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function getInitial(displayName: string | null, username: string | null): string {
  const name = displayName || username || "?";
  return name.slice(0, 1).toUpperCase();
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="bg-card rounded-2xl p-4 space-y-1 shadow-warm-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="font-display font-bold text-lg">{value}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface UserProfileClientProps {
  username: string;
}

export function UserProfileClient({ username }: UserProfileClientProps) {
  const { data: profile, isLoading: profileLoading, error } = usePublicProfile(username);
  const { data: sharedGroups, isLoading: groupsLoading } = useSharedGroups(username);
  const { data: currentUser } = useCurrentUser();

  const { showSkeleton } = useSkeletonState(profileLoading);
  if (showSkeleton) return <UserProfileSkeleton />;

  // 404 handling
  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <div className="flex items-center justify-start">
          <Link
            href="/"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-muted"
            aria-label="Voltar para o início"
          >
            <Home className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
        <p className="text-5xl">404</p>
        <h1 className="text-xl font-semibold">Usuario nao encontrado</h1>
        <p className="text-muted-foreground text-sm">
          O usuario{" "}
          <span className="font-mono font-medium">@{username}</span> nao existe
          ou nao esta disponivel.
        </p>
      </div>
    );
  }

  const isOwnProfile =
    currentUser?.username === profile.username ||
    currentUser?.id === profile.id;

  const memberSince = formatDistanceToNow(new Date(profile.created_at), {
    locale: ptBR,
    addSuffix: true,
  });

  const memberSinceFormatted = format(new Date(profile.created_at), "MMMM 'de' yyyy", {
    locale: ptBR,
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Home button */}
      <div className="flex items-center">
        <Link
          href="/"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-muted"
          aria-label="Voltar para o início"
        >
          <Home className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name ?? profile.username ?? "Avatar"}
            className="h-24 w-24 rounded-full object-cover ring-2 ring-sage-300 dark:ring-sage-700"
          />
        ) : (
          <div className="h-24 w-24 rounded-full bg-sage-100 dark:bg-sage-800 flex items-center justify-center ring-2 ring-sage-300 dark:ring-sage-700">
            <span className="text-3xl font-bold text-sage-700 dark:text-sage-200">
              {getInitial(profile.display_name, profile.username)}
            </span>
          </div>
        )}

        <div className="space-y-0.5">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            {profile.display_name ?? profile.username ?? "Usuario"}
          </h1>
          {profile.username && (
            <p className="text-sm text-muted-foreground">
              @{profile.username}
            </p>
          )}
          {profile.status_text && (
            <p className="text-sm italic text-muted-foreground mt-1">
              &ldquo;{profile.status_text}&rdquo;
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Membro{" "}
          <span className="font-medium text-foreground">
            {memberSince}
          </span>
          {" "}
          &middot;{" "}
          <span title={memberSinceFormatted}>{memberSinceFormatted}</span>
        </p>

        {isOwnProfile && (
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/profile">Editar perfil</Link>
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Tempo de leitura"
          value={formatReadingTime(profile.total_reading_time_minutes)}
          icon={<BookOpen className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Sequencia atual"
          value={`${profile.streak_current} dias`}
          icon={<Flame className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Livros lidos"
          value={String(profile.total_books_finished)}
          icon={<BookOpen className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Maior sequencia"
          value={`${profile.streak_longest} dias`}
          icon={<Trophy className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Genres */}
      {profile.preferred_genres.length > 0 && (
        <div className="bg-card rounded-2xl p-5 shadow-warm-sm space-y-3">
          <h2 className="font-semibold text-sm">Generos favoritos</h2>
          <div className="flex flex-wrap gap-2">
            {profile.preferred_genres.map((genre) => (
              <Badge key={genre} variant="secondary" className="rounded-full">
                {genre}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Badges */}
      {profile.badges.length > 0 && (
        <div className="bg-card rounded-2xl p-5 shadow-warm-sm space-y-3">
          <h2 className="font-semibold text-sm">Conquistas</h2>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {profile.badges.slice(0, 12).map((badge) => (
              <div
                key={badge.slug}
                className="flex flex-col items-center gap-1 text-center"
                title={badge.slug}
              >
                <span className="text-2xl" aria-label={badge.slug}>
                  {badge.emoji ?? "🏅"}
                </span>
                <span className="text-xs text-muted-foreground truncate w-full text-center">
                  {badge.slug}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared groups */}
      {profile.shared_group_count > 0 && (
        <div className="bg-card rounded-2xl p-5 shadow-warm-sm space-y-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Clubes em comum
          </h2>
          {groupsLoading ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : (
            <ul className="space-y-2">
              {(sharedGroups ?? []).map((group) => (
                <li
                  key={group.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {group.photo_url ? (
                      <img
                        src={group.photo_url}
                        alt={group.name}
                        className="h-8 w-8 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <span className="font-medium truncate">{group.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {group.member_count} membro{group.member_count !== 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
