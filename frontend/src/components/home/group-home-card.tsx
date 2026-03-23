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
  const hasCover = round?.book_title && round?.book_cover_url;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="group cursor-pointer rounded-2xl border bg-card p-5 shadow-warm-sm transition-all hover:shadow-warm hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex gap-4">
        {/* Left: Book cover with spine + group avatar overlay, or just group avatar */}
        {hasCover ? (
          <div className="relative shrink-0">
            <div
              className="relative h-[88px] w-[60px] overflow-hidden rounded-lg"
              style={{
                transform: "perspective(400px) rotateY(-5deg)",
                boxShadow:
                  "-3px 2px 8px rgba(0,0,0,0.2), 1px 2px 6px rgba(0,0,0,0.08)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={round.book_cover_url!}
                alt={round.book_title!}
                className="h-full w-full object-cover"
              />
              {/* Spine shadow overlay */}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-3"
                style={{
                  background:
                    "linear-gradient(to right, rgba(0,0,0,0.25), transparent)",
                }}
              />
            </div>
            {/* Group avatar overlay */}
            <Avatar className="absolute -bottom-1.5 -right-1.5 h-7 w-7 ring-2 ring-card">
              <AvatarImage
                src={group.photo_url ?? undefined}
                alt={group.name}
                className="object-cover"
              />
              <AvatarFallback className="bg-sage-100 text-sage-700 text-[9px] font-bold dark:bg-sage-800 dark:text-sage-200">
                {group.name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <Avatar className="h-14 w-14 shrink-0 rounded-xl">
            <AvatarImage
              src={group.photo_url ?? undefined}
              alt={group.name}
              className="object-cover"
            />
            <AvatarFallback className="rounded-xl bg-sage-100 text-sage-700 text-lg font-display font-bold dark:bg-sage-800 dark:text-sage-200">
              {group.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Right: Group info */}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="truncate text-lg font-display font-bold tracking-tight">
                {group.name}
              </h3>
              {round && (
                <Badge
                  variant={STATUS_VARIANTS[round.status] ?? "outline"}
                  className="shrink-0 text-[10px]"
                >
                  {STATUS_LABELS[round.status] ?? round.status}
                </Badge>
              )}
            </div>

            {round?.book_title && (
              <div className="mt-1.5">
                <p className="truncate text-sm font-display italic text-foreground/80">
                  {round.book_title}
                </p>
                {round.book_author && (
                  <p className="truncate text-xs text-muted-foreground">
                    por {round.book_author}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-3">
            {progress !== null && round?.status === "reading" && (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Progress
                  value={progress.percentage}
                  className="h-1.5 flex-1"
                />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {Math.round(progress.percentage)}%
                </span>
              </div>
            )}
            {/* Member count + avatars */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {group.member_count} membro{group.member_count !== 1 ? "s" : ""}
              </span>
              {group.members_preview.length > 0 && (
                <AvatarGroup>
                  {group.members_preview.slice(0, 3).map((m) => (
                    <Avatar key={m.user_id} size="sm">
                      <AvatarImage
                        src={m.avatar_url ?? undefined}
                        alt={m.display_name ?? "Membro"}
                      />
                      <AvatarFallback className="text-[9px]">
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
          </div>
        </div>
      </div>

      {/* Last message — separated visually */}
      {lastMsg && (
        <>
          <div className="my-3 border-t border-border/40" />
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-medium">
              {lastMsg.sender_display_name ?? "Alguém"}:
            </span>{" "}
            {lastMsg.content_type === "text" && lastMsg.content_text
              ? lastMsg.content_text
              : lastMsg.content_type === "image"
                ? "Imagem"
                : lastMsg.content_type === "gif"
                  ? "GIF"
                  : "Mensagem"}{" "}
            ·{" "}
            {formatDistanceToNow(new Date(lastMsg.created_at), {
              addSuffix: true,
              locale: ptBR,
            })}
          </p>
        </>
      )}
    </div>
  );
}
