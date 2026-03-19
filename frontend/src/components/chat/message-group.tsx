"use client";

import { differenceInMinutes, parseISO } from "date-fns";
import { type ChatMessage } from "@/lib/types/chat";
import { MessageBubble } from "./message-bubble";

interface MessageGroupProps {
  messages: ChatMessage[];
  isOwn: boolean;
  currentUserId: string;
  viewerChapter?: number | null;
  onReply?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
}

/**
 * Renders a run of messages from the same sender.
 *
 * Avatar and name are shown only for the first message in the group, or
 * whenever there is a gap of more than 2 minutes since the previous message.
 * All other messages in the group keep an invisible avatar-width placeholder
 * so that the bubble column stays visually aligned.
 */
export function MessageGroup({
  messages,
  isOwn,
  currentUserId,
  viewerChapter,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
}: MessageGroupProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {messages.map((message, index) => {
        const isFirst = index === 0;

        let showAvatar = isFirst;
        let showName = isFirst;

        if (!isFirst) {
          const prev = messages[index - 1];
          const gapMinutes = differenceInMinutes(
            parseISO(message.created_at),
            parseISO(prev.created_at),
          );
          if (gapMinutes > 2) {
            showAvatar = true;
            showName = true;
          }
        }

        return (
          <MessageBubble
            key={message.id}
            message={message}
            isOwn={isOwn}
            showAvatar={showAvatar}
            showName={showName}
            currentUserId={currentUserId}
            viewerChapter={viewerChapter}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleReaction={onToggleReaction}
          />
        );
      })}
    </div>
  );
}
