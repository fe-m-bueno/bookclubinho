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

/**
 * A fase é um rótulo tipográfico, não uma cápsula.
 *
 * Era um `Badge` — pílula de cantos totalmente arredondados, fundo próprio e
 * borda — ao lado de um avatar de cantos arredondados e de um card de cantos
 * arredondados. Três raios diferentes em 200px de largura é o que faz uma tela
 * parecer montada com peças de catálogo. Em caixa alta, com espaçamento entre
 * letras e a cor fazendo o trabalho, a fase informa sem virar objeto.
 */
const STATUS_TONES: Partial<Record<RoundStatus, string>> = {
  nominating: "text-muted-foreground",
  voting: "text-sage-700 dark:text-sage-300",
  reading: "text-sage-700 dark:text-sage-300",
  reviewing: "text-muted-foreground",
};

/**
 * O que a fase pede de quem está olhando.
 *
 * `nominating` e `voting` só cobram quem ainda não agiu — o backend já diz
 * isso em `needs_my_action`, e cobrar de novo quem já votou é ruído. `reading`
 * e `reviewing` cobram sempre: atualizar progresso não tem "pronto".
 *
 * O rótulo é o único aviso. Havia também um "falta seu voto" ao lado do botão
 * "Votar", debaixo de um chip "Votando" — três elementos dizendo a mesma coisa
 * em três tipografias. Como o botão só existe quando a rodada trava em você, a
 * presença dele já é o "falta".
 */
function phaseAction(round: GroupListItem["current_round"]): string | null {
  if (!round) return null;
  switch (round.status) {
    case "nominating":
      return round.needs_my_action ? "Indicar livro" : null;
    case "voting":
      return round.needs_my_action ? "Votar" : null;
    case "reading":
      return "Atualizar leitura";
    case "reviewing":
      return "Avaliar";
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
  const deadline = describeDeadline(
    round?.deadline ?? null,
    undefined,
    round?.status,
  );
  const action = phaseAction(round);

  return (
    /* O card não é mais um `div role="button"` gigante: com a ação da fase
       dentro dele havia dois destinos, e um botão dentro de um botão não é
       navegável por teclado nem anunciado por leitor de tela. O nome do clube
       é o link principal e se estende sobre o card pelo `::after`; a ação da
       fase fica acima dele no empilhamento. */
    <article className="group relative overflow-hidden rounded-2xl border bg-card shadow-warm-sm transition-[box-shadow,background-color] hover:shadow-warm hover:bg-accent/30 focus-within:ring-2 focus-within:ring-ring">
      {/* Corpo: quem é o clube e o que ele está lendo. O que a rodada pede
          desceu para o rodapé — antes as duas coisas dividiam o mesmo bloco,
          separadas só por uma linha de 1px e uma margem, e o card lia como uma
          pilha de faixas sem começo nem fim. */}
      <div className="flex gap-4 p-5">
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
          /* Redondo, e não um quadrado de cantos arredondados: o clube é um
             grupo de pessoas, e é assim que o resto do app desenha gente. O
             quadrado com raio próprio só somava um terceiro arredondamento ao
             lado do card e da antiga pílula de fase. */
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarImage
              src={group.photo_url ?? undefined}
              alt={group.name}
              className="object-cover"
            />
            <AvatarFallback className="bg-sage-100 text-sage-700 text-base font-display font-bold dark:bg-sage-800 dark:text-sage-200">
              {group.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Os avatares só dividem a linha do nome a partir de `sm:`. Em
              375px eles roubavam do título o espaço que ele não tem: com o
              chip da fase ao lado, "Clube da Meia-Noite" virava "Club…". Na
              tela estreita eles descem para uma linha própria — mesmo DOM, sem
              `order-*` invertendo leitura e tela. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <div className="min-w-0 flex-1">
              {/* Em 375px a fase desce para a própria linha. Lado a lado, o
                  título a 20px dividia a largura com um rótulo em caixa alta e
                  espaçado, e "Clube da Meia-Noite" virava "Clube da Me…". No
                  desktop sobra largura e os dois voltam para a mesma linha. */}
              <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5">
                {/* `max-w-full`: com a coluna empilhada, `items-start` deixa o
                    h3 do tamanho do conteúdo, e sem largura definida o
                    `truncate` não tem onde cortar — o nome vazava para fora do
                    card em vez de virar reticências. */}
                <h3 className="type-title min-w-0 max-w-full truncate tracking-tight">
                  <Link
                    href={`/groups/${group.id}`}
                    /* `draggable={false}`: segurar o mouse sobre o nome
                       arrastava o fantasma do link — a miniatura translúcida
                       com o título — em vez de selecionar o texto. */
                    draggable={false}
                    className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
                  >
                    {group.name}
                  </Link>
                </h3>
                {round && (
                  <span
                    className={cn(
                      "type-micro relative shrink-0 tracking-[0.12em] uppercase",
                      STATUS_TONES[round.status] ?? "text-muted-foreground",
                    )}
                  >
                    {STATUS_LABELS[round.status] ?? round.status}
                  </span>
                )}
              </div>

              {/* `relative` nos textos: o link do nome se estende sobre o card
                  inteiro por um `::after`, e essa camada engolia a seleção —
                  não dava para copiar título, autor nem mensagem de lugar
                  nenhum. Posicionados, eles vêm por cima da camada e voltam a
                  ser texto; o clique em qualquer área vazia do card continua
                  levando ao clube. */}
              {round?.book_title && (
                <div className="relative mt-1.5 w-fit max-w-full">
                  {/* Rubik, e não Fraunces: a serifa aqui disputava com o nome
                      do clube logo acima, que é quem manda no card. E a 14px o
                      Fraunces vinha com corte de display, itálico, no tamanho
                      em que ele menos se sustenta. */}
                  <p className="type-body truncate italic">{round.book_title}</p>
                  {round.book_author && (
                    <p className="type-meta truncate">por {round.book_author}</p>
                  )}
                </div>
              )}
            </div>

            {/* Quem está no clube fica junto do clube, no alto — não no meio
                das métricas da rodada. A contagem saiu do texto e virou o
                rótulo acessível do grupo: "3 membros" ao lado de três rostos
                era o mesmo dado escrito duas vezes.

                O `+N` conta por `member_count`, não pelo tamanho da lista: o
                backend manda no máximo 4 avatares, então um clube de 8 pessoas
                dizia "+1". */}
            {group.members_preview.length > 0 && (
              <AvatarGroup
                role="group"
                className="shrink-0"
                aria-label={`${group.member_count} membro${group.member_count !== 1 ? "s" : ""}`}
              >
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
                {group.member_count > 3 && (
                  <AvatarGroupCount>+{group.member_count - 3}</AvatarGroupCount>
                )}
              </AvatarGroup>
            )}
          </div>

          {/* O progresso ganha a linha inteira, sempre. Dividi-la com a lista
              de membros deixava a barra com ~40px em 375px — larga demais para
              ser ignorada, curta demais para dizer alguma coisa. */}
          {progress !== null && round?.status === "reading" && (
            <div className="mt-3 flex items-center gap-3">
              <Progress value={progress.percentage} className="h-1.5 flex-1" />
              <span className="type-micro shrink-0 tabular-nums">
                {Math.round(progress.percentage)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* O rodapé: o que a rodada pede e o que aconteceu por lá. Uma faixa de
          verdade — fundo próprio e borda de topo — e não mais duas fileiras
          soltas separadas por um filete de 1px. Some inteira quando não há
          prazo, ação nem conversa; um clube em leitura tranquila continua um
          card curto. */}
      {(deadline || action || lastMsg) && (
        // Em 375px a faixa empilha: lado a lado, a conversa ficava com ~90px
        // ("Alice: gente, vot…") e o botão não alcançava os 44px de alvo de
        // toque em largura confortável. Empilhada, cada coisa tem sua linha e
        // o botão ocupa a largura do card.
        <div className="flex flex-col items-stretch gap-2 border-t bg-muted/40 px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
          {deadline && (
            <span
              className={cn(
                "type-meta relative shrink-0",
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

          {/* Prazo e conversa são ambos texto pequeno e apagado: lado a lado
              sem nada no meio, leem como uma frase só. O filete vertical é o
              que diz que são dois assuntos. */}
          {deadline && lastMsg && (
            <span aria-hidden className="hidden h-3 w-px bg-border sm:block" />
          )}

          {lastMsg && (
            <p className="type-meta relative min-w-0 truncate sm:flex-1">
              <span className="font-medium text-foreground/70">
                {lastMsg.sender_display_name ?? "Alguém"}:
              </span>{" "}
              {previewText(lastMsg.content_type, lastMsg.content_text)} ·{" "}
              {formatDistanceToNow(new Date(lastMsg.created_at), {
                addSuffix: true,
                locale: ptBR,
              })}
            </p>
          )}

          {action && (
            <Link
              href={`/groups/${group.id}/round`}
              // `self-end` em vez de esticar: um botão sólido da largura do
              // card, repetido em cada clube, transforma a lista numa fileira
              // de CTAs. À direita ele continua com 44px de alvo de toque e
              // ocupa a mesma posição que tem no desktop.
              className="type-meta relative inline-flex min-h-11 shrink-0 items-center justify-center self-end rounded-lg bg-primary px-4 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] sm:ml-auto sm:min-h-9 sm:self-auto"
            >
              {action}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
