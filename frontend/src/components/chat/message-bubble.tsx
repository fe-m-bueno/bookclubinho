"use client";

import { useCallback } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Reply } from "lucide-react";
import { type ChatMessage } from "@/lib/types/chat";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { MessageContent } from "./message-content";
import { MessageDeleted } from "./message-deleted";
import { MessageReactions } from "./message-reactions";
import { MessageContextMenu } from "./message-context-menu";
import { SpoilerOverlay } from "./spoiler-overlay";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showAvatar: boolean;
  showName: boolean;
  currentUserId: string;
  /** Current reading chapter of the viewer — used by SpoilerOverlay for auto-reveal */
  viewerChapter?: number | null;
  onReply?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
}

function ReplyPreview({ message }: { message: ChatMessage }) {
  const authorName =
    message.author.display_name ?? message.author.username;
  const preview = message.content_text?.slice(0, 80) ?? "[mídia]";

  return (
    <div className="mb-1.5 flex items-start gap-2 rounded-xl rounded-b-sm border-l-2 border-sage-400 bg-black/5 px-2.5 py-1.5 dark:bg-white/5">
      <Reply
        className="mt-0.5 size-3 shrink-0 text-sage-500 dark:text-sage-400"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-sage-700 dark:text-sage-300">
          {authorName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{preview}</p>
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  isOwn,
  showAvatar,
  showName,
  currentUserId,
  viewerChapter,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
}: MessageBubbleProps) {
  const authorName =
    message.author.display_name ?? message.author.username;

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
  // no-ops: emoji picker and copy are handled inside the context-menu component
  const handleReact = useCallback(() => {}, []);
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
        {/* Avatar column — invisible placeholder keeps right-side alignment */}
        {isOwn ? (
          <div className="w-7 shrink-0" aria-hidden="true" />
        ) : showAvatar ? (
          <Avatar
            className="mb-0.5 size-7 shrink-0 self-end"
            aria-label={authorName}
          >
            {message.author.avatar_url && (
              <AvatarImage
                src={message.author.avatar_url}
                alt={authorName}
              />
            )}
            <AvatarFallback className="text-xs">{avatarInitial}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-7 shrink-0" aria-hidden="true" />
        )}

        {/* Message content column */}
        <div
          className={cn(
            "flex max-w-[75%] flex-col gap-0.5 sm:max-w-[65%]",
            isOwn ? "items-end" : "items-start",
          )}
        >
          {/* Sender name (others only) */}
          {showName && !isOwn && (
            <span className="px-1 text-xs text-muted-foreground">
              {authorName}
            </span>
          )}

          {/* Bubble */}
          <div
            className={cn(
              "relative rounded-2xl px-3 py-2 text-sm",
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

            {/* Timestamp + edited marker */}
            <div
              className={cn(
                "mt-1 flex items-center gap-1",
                isOwn ? "justify-end" : "justify-start",
              )}
            >
              <time
                dateTime={message.created_at}
                className="text-[10px] text-muted-foreground/70"
              >
                {timeLabel}
              </time>
              {isEdited && (
                <span className="text-[10px] text-muted-foreground/60">
                  (editada)
                </span>
              )}
            </div>
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
      </div>
    </MessageContextMenu>
  );
}
