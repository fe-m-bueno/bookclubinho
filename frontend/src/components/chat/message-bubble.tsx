"use client";

import { useCallback, useRef } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Reply } from "lucide-react";
import { type ChatMessage } from "@/lib/types/chat";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { MessageContent } from "./message-content";
import { MessageDeleted } from "./message-deleted";
import { MessageReactions } from "./message-reactions";
import { MessageContextMenu } from "./message-context-menu";
import { useChatStore } from "@/stores/chat-store";
import { SpoilerOverlay } from "./spoiler-overlay";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  /**
   * Última mensagem do bloco: é ela que recebe o avatar e o horário.
   *
   * Os dois marcam o fim da fala. O avatar estava na primeira do bloco, com os
   * vãos das seguintes vazios embaixo dele, e o horário era uma linha própria
   * dentro de cada bolha — toda bolha pagava uma linha de altura e a largura
   * de "14:32", que é o motivo de "ok" virar um bloco em vez de uma palavra.
   */
  isGroupEnd: boolean;
  showName: boolean;
  currentUserId: string;
  /** Capítulo em que o leitor está — o SpoilerOverlay usa para auto-reveal. */
  viewerChapter: number | null;
  onReply?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
}

function ReplyPreview({ message }: { message: ChatMessage }) {
  const authorName = message.author.display_name ?? message.author.username;
  const preview = message.content_text?.slice(0, 80) ?? "[mídia]";

  return (
    <div className="mb-1.5 flex items-start gap-2 rounded-xl rounded-b-sm border-l-2 border-sage-400 bg-black/5 px-2.5 py-1.5 dark:bg-white/5">
      <Reply
        className="mt-0.5 size-3 shrink-0 text-sage-500 dark:text-sage-400"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="type-micro truncate text-sage-700 dark:text-sage-300">
          {authorName}
        </p>
        <p className="type-micro truncate">{preview}</p>
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  isOwn,
  isGroupEnd,
  showName,
  currentUserId,
  viewerChapter,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
}: MessageBubbleProps) {
  const authorName = message.author.display_name ?? message.author.username;

  const timeLabel = format(parseISO(message.created_at), "HH:mm", {
    locale: ptBR,
  });

  const isEdited =
    !message.is_deleted &&
    message.updated_at !== null &&
    message.updated_at !== message.created_at;

  const avatarInitial = authorName.slice(0, 1).toUpperCase();

  const handleReply = useCallback(() => onReply?.(message), [message, onReply]);
  const handleEdit = useCallback(() => onEdit?.(message), [message, onEdit]);
  const handleDelete = useCallback(
    () => onDelete?.(message.id),
    [message.id, onDelete],
  );
  const columnRef = useRef<HTMLDivElement>(null);
  const handleReact = useCallback(() => {
    const rect = columnRef.current?.getBoundingClientRect();
    if (!rect) return;
    useChatStore.getState().openReactionPicker({
      messageId: message.id,
      isOwn,
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      },
    });
  }, [message.id, isOwn]);
  // no-op: copy is handled inside the context-menu component
  const handleCopy = useCallback(() => {}, []);

  return (
    <MessageContextMenu
      message={message}
      isOwn={isOwn}
      onReply={handleReply}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onReact={handleReact}
      onCopy={handleCopy}
    >
      <div
        className={cn(
          "group flex items-end gap-2",
          isOwn ? "flex-row-reverse" : "flex-row",
        )}
      >
        {/* Coluna do avatar. O placeholder invisível mantém as bolhas do bloco
            alinhadas entre si: sem ele, só a última teria recuo. */}
        {!isOwn && isGroupEnd ? (
          <Avatar
            className="mb-0.5 size-7 shrink-0 self-end"
            aria-label={authorName}
          >
            {message.author.avatar_url && (
              <AvatarImage src={message.author.avatar_url} alt={authorName} />
            )}
            <AvatarFallback className="text-xs">{avatarInitial}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-7 shrink-0" aria-hidden="true" />
        )}

        {/* Message content column */}
        <div
          ref={columnRef}
          className={cn(
            "flex max-w-[75%] flex-col gap-0.5 sm:max-w-[65%]",
            isOwn ? "items-end" : "items-start",
          )}
        >
          {/* Sender name (others only) */}
          {showName && !isOwn && (
            <span className="type-micro px-1">{authorName}</span>
          )}

          {/* Bubble */}
          <div
            className={cn(
              // A bolha não fixa tamanho: quem manda é o `type-body` do texto
              // da mensagem lá dentro. Aqui ela só herda a cor.
              "relative rounded-2xl px-3 py-2",
              isOwn
                ? "rounded-br-sm bg-sage-100 text-sage-900 dark:bg-sage-800 dark:text-sage-100"
                : "rounded-bl-sm bg-muted text-foreground",
            )}
          >
            {/* Reply-to preview */}
            {message.parent_message_id && !message.is_deleted && (
              <ReplyPreview message={message} />
            )}

            {/* Body */}
            {message.is_deleted ? (
              <MessageDeleted />
            ) : (
              <SpoilerOverlay
                message={message}
                currentUserId={currentUserId}
                viewerChapter={viewerChapter}
              >
                <MessageContent message={message} />
              </SpoilerOverlay>
            )}

            {/* O horário saiu daqui; "(editada)" ficou. O horário aparece uma
                vez por bloco e pode estar em outra bolha, mas a edição é
                daquela mensagem: fora da bolha ela apontaria para a errada. */}
            {isEdited && (
              <div
                className={cn(
                  "mt-0.5 flex",
                  isOwn ? "justify-end" : "justify-start",
                )}
              >
                <span className="type-micro">(editada)</span>
              </div>
            )}
          </div>

          {/* Reactions */}
          {!message.is_deleted && message.reactions.length > 0 && (
            <MessageReactions
              reactions={message.reactions}
              messageId={message.id}
              isOwn={isOwn}
              onToggle={(emoji) => onToggleReaction?.(message.id, emoji)}
            />
          )}
        </div>

        {/* O horário, uma vez por bloco, do lado de fora da bolha.
            `shrink-0` com a coluna de conteúdo em `max-w-[75%]`: em 375px a
            soma de avatar, bolha e horário fica no limite da largura, e é a
            bolha que tem que ceder — o horário cortado não serve para nada. */}
        {isGroupEnd && (
          <time
            dateTime={message.created_at}
            className="type-micro mb-0.5 shrink-0 self-end tabular-nums"
          >
            {timeLabel}
          </time>
        )}
      </div>
    </MessageContextMenu>
  );
}
