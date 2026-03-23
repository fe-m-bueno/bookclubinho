"use client";

import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { GroupListItem, RoundStatus } from "@/lib/types/group";

interface GroupHomeCardProps {
  group: GroupListItem;
}

const STATUS_LABELS: Partial<Record<RoundStatus, string>> = {
  nominating: "Indicando",
  voting: "Votando",
  reading: "Lendo",
  reviewing: "Avaliando",
};

const STATUS_VARIANTS: Partial<
  Record<RoundStatus, "default" | "secondary" | "destructive" | "outline">
> = {
  nominating: "outline",
  voting: "secondary",
  reading: "default",
  reviewing: "secondary",
};

export function GroupHomeCard({ group }: GroupHomeCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/groups/${group.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const round = group.current_round;
  const progress = group.my_reading_progress;
  const lastMsg = group.last_message_preview;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-5 shadow-warm-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        {/* Group photo */}
        <Avatar className="h-12 w-12 rounded-xl">
          <AvatarImage
            src={group.photo_url ?? undefined}
            alt={group.name}
            className="object-cover"
          />
          <AvatarFallback className="rounded-xl text-base font-semibold">
            {group.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Name + status */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display font-semibold text-foreground">
              {group.name}
            </h3>
            {round && (
              <Badge
                variant={STATUS_VARIANTS[round.status] ?? "outline"}
                className="shrink-0 text-xs"
              >
                {STATUS_LABELS[round.status] ?? round.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {group.member_count} membro{group.member_count !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Member avatars */}
        {group.members_preview.length > 0 && (
          <AvatarGroup>
            {group.members_preview.slice(0, 3).map((m) => (
              <Avatar key={m.user_id} size="sm">
                <AvatarImage
                  src={m.avatar_url ?? undefined}
                  alt={m.display_name ?? "Membro"}
                />
                <AvatarFallback className="text-xs">
                  {(m.display_name ?? "?").slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {group.members_preview.length > 3 && (
              <AvatarGroupCount>
                +{group.members_preview.length - 3}
              </AvatarGroupCount>
            )}
          </AvatarGroup>
        )}
      </div>

      {/* Book + progress row */}
      {round?.book_title && (
        <div className="flex items-center gap-3 rounded-xl bg-muted/30 px-3.5 py-2.5">
          {round.book_cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={round.book_cover_url}
              alt={round.book_title}
              className="h-12 w-8 shrink-0 rounded object-cover shadow-sm"
            />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-sm font-medium">{round.book_title}</p>
            {round.book_author && (
              <p className="truncate text-xs text-muted-foreground">
                {round.book_author}
              </p>
            )}
            {progress !== null && round.status === "reading" && (
              <div className="flex items-center gap-2">
                <Progress
                  value={progress.percentage}
                  className="h-1.5 flex-1"
                />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {Math.round(progress.percentage)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Last message preview */}
      {lastMsg && (
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-medium">
            {lastMsg.sender_display_name ?? "Alguém"}:
          </span>{" "}
          {lastMsg.content_type === "text" && lastMsg.content_text
            ? lastMsg.content_text
            : lastMsg.content_type === "image"
              ? "📷 Imagem"
              : lastMsg.content_type === "gif"
                ? "🎞️ GIF"
                : "Mensagem"}{" "}
          ·{" "}
          {formatDistanceToNow(new Date(lastMsg.created_at), {
            addSuffix: true,
            locale: ptBR,
          })}
        </p>
      )}
    </div>
  );
}
