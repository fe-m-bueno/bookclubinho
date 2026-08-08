"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
import { describeDeadline } from "@/lib/deadline";
import { cn } from "@/lib/utils";
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

/**
 * O que a fase pede de quem está olhando.
 *
 * `nominating` e `voting` só cobram quem ainda não agiu — o backend já diz
 * isso em `needs_my_action`, e cobrar de novo quem já votou é ruído. `reading`
 * e `reviewing` cobram sempre: atualizar progresso não tem "pronto".
 */
function phaseAction(
  round: GroupListItem["current_round"],
): { label: string; nudge: string | null } | null {
  if (!round) return null;
  switch (round.status) {
    case "nominating":
      return round.needs_my_action
        ? { label: "Indicar livro", nudge: "falta sua indicação" }
        : null;
    case "voting":
      return round.needs_my_action
        ? { label: "Votar", nudge: "falta seu voto" }
        : null;
    case "reading":
      return { label: "Atualizar leitura", nudge: null };
    case "reviewing":
      return { label: "Avaliar", nudge: null };
    default:
      return null;
  }
}

/**
 * O preview da última mensagem.
 *
 * O código anterior mandava para "Mensagem" tudo que não fosse text/image/gif,
 * descartando o `content_text` que a API já tinha enviado — um marcador de
 * capítulo lia como "Mensagem". Spoiler é a única exceção deliberada: ele tem
 * texto e não pode aparecer aqui, senão o mecanismo inteiro não serve para
 * nada na tela que fica aberta o dia todo.
 */
function previewText(
  contentType: string,
  contentText: string | null,
): string {
  if (contentType === "spoiler") return "Spoiler";
  if (contentType === "image") return contentText ?? "Imagem";
  if (contentType === "gif") return contentText ?? "GIF";
  if (contentText) return contentText;
  if (contentType === "chapter_marker" || contentType === "page_marker") {
    return "Marcador de leitura";
  }
  return "Mensagem";
}

export function GroupHomeCard({ group }: GroupHomeCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);

  const round = group.current_round;
  const progress = group.my_reading_progress;
  const lastMsg = group.last_message_preview;
  const hasCover = Boolean(
    round?.book_title && round?.book_cover_url && !coverFailed,
  );
  const deadline = describeDeadline(round?.deadline ?? null);
  const action = phaseAction(round);

  return (
    /* O card não é mais um `div role="button"` gigante: com a ação da fase
       dentro dele havia dois destinos, e um botão dentro de um botão não é
       navegável por teclado nem anunciado por leitor de tela. O nome do clube
       é o link principal e se estende sobre o card pelo `::after`; a ação da
       fase fica acima dele no empilhamento. */
    <article className="group relative rounded-2xl border bg-card p-5 shadow-warm-sm transition-[box-shadow,background-color] hover:shadow-warm hover:bg-accent/30 focus-within:ring-2 focus-within:ring-ring">
      <div className="flex gap-4">
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
              <Image
                src={round!.book_cover_url!}
                alt={round!.book_title!}
                fill
                sizes="60px"
                className="object-cover"
                unoptimized
                /* Sem isto, uma URL quebrada faz o browser desenhar o `alt` —
                   o título do livro vazava como texto cru no slot de 60×88. */
                onError={() => setCoverFailed(true)}
              />
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-3"
                style={{
                  background:
                    "linear-gradient(to right, rgba(0,0,0,0.25), transparent)",
                }}
              />
            </div>
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

        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 truncate text-lg font-display font-bold tracking-tight">
                <Link
                  href={`/groups/${group.id}`}
                  className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
                >
                  {group.name}
                </Link>
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

          {/* `flex-wrap`: em 375px a barra de progresso e a lista de membros
              não cabem na mesma linha, e a barra sobrava com ~40px — larga
              demais para ser ignorada, curta demais para dizer alguma coisa.
              Em tela estreita a barra fica com a linha inteira. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {progress !== null && round?.status === "reading" && (
              <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
                <Progress value={progress.percentage} className="h-1.5 flex-1" />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {Math.round(progress.percentage)}%
                </span>
              </div>
            )}
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

      {/* Prazo e ação: a linha que faz o card pedir alguma coisa. Só existe
          quando há o que pedir — um clube em leitura tranquila não ganha
          faixa nenhuma. */}
      {(deadline || action) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {deadline && (
            <span
              className={cn(
                "text-xs",
                deadline.tone === "overdue"
                  ? "font-medium text-destructive"
                  : deadline.tone === "urgent"
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {deadline.label}
            </span>
          )}
          {action?.nudge && (
            <span className="text-xs font-medium text-primary">
              {action.nudge}
            </span>
          )}
          {action && (
            <Link
              href={`/groups/${group.id}/round`}
              className="relative ml-auto inline-flex min-h-9 items-center rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
            >
              {action.label}
            </Link>
          )}
        </div>
      )}

      {lastMsg && (
        <>
          <div className="my-3 border-t border-border/40" />
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-medium">
              {lastMsg.sender_display_name ?? "Alguém"}:
            </span>{" "}
            {previewText(lastMsg.content_type, lastMsg.content_text)} ·{" "}
            {formatDistanceToNow(new Date(lastMsg.created_at), {
              addSuffix: true,
              locale: ptBR,
            })}
          </p>
        </>
      )}
    </article>
  );
}
