"use client";

import Image from "next/image";
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
import { formatReadingTime } from "@/lib/reading-time";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
        <span className="type-micro">{label}</span>
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
        <h1 className="text-xl font-semibold">Usuário não encontrado</h1>
        <p className="type-meta">
          O usuário{" "}
          <span className="font-mono font-medium">@{username}</span> não existe
          ou não está disponível.
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
          <Image
            src={profile.avatar_url}
            alt={profile.display_name ?? profile.username ?? "Avatar"}
            width={96}
            height={96}
            className="h-24 w-24 rounded-full object-cover ring-2 ring-sage-300 dark:ring-sage-700"
            unoptimized
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
            <p className="type-meta">
              @{profile.username}
            </p>
          )}
          {profile.status_text && (
            <p className="type-meta italic mt-1">
              &ldquo;{profile.status_text}&rdquo;
            </p>
          )}
        </div>

        <p className="type-micro">
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
          label="Sequência atual"
          value={`${profile.streak_current} dias`}
          icon={<Flame className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Livros lidos"
          value={String(profile.total_books_finished)}
          icon={<BookOpen className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Maior sequência"
          value={`${profile.streak_longest} dias`}
          icon={<Trophy className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Genres */}
      {profile.preferred_genres.length > 0 && (
        <div className="bg-card rounded-2xl p-5 shadow-warm-sm space-y-3">
          <h2 className="type-title">Gêneros favoritos</h2>
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
          <h2 className="type-title">Conquistas</h2>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {profile.badges.slice(0, 12).map((badge) => {
              // O mesmo badge conquistado em vários clubes vem agrupado com
              // `count` — a repetição vira um multiplicador, não uma linha nova.
              const rotulo =
                badge.count > 1 ? `${badge.name} ×${badge.count}` : badge.name;
              return (
                <div
                  key={badge.slug}
                  className="flex flex-col items-center gap-1 text-center"
                  title={rotulo}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {badge.emoji ?? "🏅"}
                  </span>
                  {/* `truncate` cortava "Fundador ×2" em 375px, onde a célula
                      tem ~70px. Nome de badge é curto: duas linhas cabem. */}
                  <span className="type-micro w-full text-center line-clamp-2">
                    {rotulo}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Shared groups */}
      {profile.shared_group_count > 0 && (
        <div className="bg-card rounded-2xl p-5 shadow-warm-sm space-y-3">
          <h2 className="type-title flex items-center gap-2">
            <Users className="h-4 w-4" />
            Clubes em comum
          </h2>
          {groupsLoading ? (
            <p className="type-micro">Carregando...</p>
          ) : (
            <ul className="space-y-2">
              {(sharedGroups ?? []).map((group) => (
                <li
                  key={group.id}
                  className="type-body flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {group.photo_url ? (
                      <Image
                        src={group.photo_url}
                        alt={group.name}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-lg object-cover shrink-0"
                        unoptimized
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <span className="truncate">{group.name}</span>
                  </div>
                  <span className="type-micro shrink-0 ml-2">
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
