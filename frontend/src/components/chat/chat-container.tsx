"use client";

import { useCallback, useRef } from "react";
import { useGroup } from "@/lib/contexts/group-context";
import { useChatStore } from "@/stores/chat-store";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { useChatSSE } from "@/hooks/use-chat-sse";
import {
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  useToggleReaction,
} from "@/hooks/use-chat-mutations";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useTypingIndicator } from "@/hooks/use-typing-indicator";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { NewMessagePill } from "./new-message-pill";
import type { ChatMessage, MessageCreatePayload } from "@/lib/types/chat";

interface ChatContainerProps {
  groupId: string;
}

export function ChatContainer({ groupId }: ChatContainerProps) {
  const { group } = useGroup();
  const currentUserId = group.current_user_id;
  const currentMember = group.members.find((m) => m.user_id === currentUserId);
  const currentUserName = currentMember?.display_name || currentMember?.username || "Você";
  const currentUserAvatar = currentMember?.avatar_url ?? null;

  const chapterFilter = useChatStore((s) => s.chapterFilter);
  const isAtBottom = useChatStore((s) => s.isAtBottom);
  const unreadCount = useChatStore((s) => s.unreadCount);
  const editingMessage = useChatStore((s) => s.editingMessage);
  const replyTo = useChatStore((s) => s.replyTo);

  const {
    messages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useChatMessages({ groupId, chapterFilter });

  const { connected } = useChatSSE({ groupId, currentUserId });
  const { sendTyping, typingUsers } = useTypingIndicator(groupId, currentUserId);

  const sendMutation = useSendMessage(groupId, {
    id: currentUserId,
    name: currentUserName,
    avatar: currentUserAvatar,
  });
  const editMutation = useEditMessage();
  const deleteMutation = useDeleteMessage();
  const toggleReactionMutation = useToggleReaction();
  const { upload: uploadMedia } = useMediaUpload(groupId);

  const scrollRef = useRef<{ scrollToBottom: () => void }>(null);

  const handleSend = useCallback(
    (text: string, richJson: Record<string, unknown>) => {
      if (editingMessage) {
        editMutation.mutate(
          {
            messageId: editingMessage.id,
            payload: { content_text: text, content_rich_json: richJson },
          },
          {
            onSuccess: () => useChatStore.getState().setEditingMessage(null),
          },
        );
        return;
      }

      const payload: MessageCreatePayload = {
        content_type: "text",
        content_text: text,
        content_rich_json: richJson,
        parent_message_id: replyTo?.id ?? null,
      };

      sendMutation.mutate(payload, {
        onSuccess: () => {
          useChatStore.getState().setReplyTo(null);
          scrollRef.current?.scrollToBottom();
        },
      });
    },
    [editingMessage, replyTo, sendMutation, editMutation],
  );

  const handleSendSpecial = useCallback(
    (partial: Partial<MessageCreatePayload>) => {
      const payload: MessageCreatePayload = {
        content_type: partial.content_type || "text",
        content_text: partial.content_text,
        reference_type: partial.reference_type,
        reference_value: partial.reference_value,
        is_spoiler: partial.is_spoiler,
        spoiler_chapter: partial.spoiler_chapter,
      };
      sendMutation.mutate(payload, {
        onSuccess: () => scrollRef.current?.scrollToBottom(),
      });
    },
    [sendMutation],
  );

  const handleImageSelect = useCallback(
    async (file: File) => {
      try {
        const result = await uploadMedia(file);
        const payload: MessageCreatePayload = {
          content_type: "image",
          media_url: result.media_url,
          thumbnail_url: result.thumbnail_url,
          content_text: null,
        };
        sendMutation.mutate(payload, {
          onSuccess: () => scrollRef.current?.scrollToBottom(),
        });
      } catch {
        // Error handled by useMediaUpload hook
      }
    },
    [uploadMedia, sendMutation],
  );

  const handleScrollToBottom = useCallback(() => {
    scrollRef.current?.scrollToBottom();
    useChatStore.getState().setUnreadCount(0);
  }, []);

  const handleClearFilter = useCallback(() => {
    useChatStore.getState().setChapterFilter(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => deleteMutation.mutate(id),
    [deleteMutation],
  );

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) =>
      toggleReactionMutation.mutate({ messageId, payload: { emoji } }),
    [toggleReactionMutation],
  );

  const handleReply = useCallback((msg: ChatMessage) => {
    useChatStore.getState().setReplyTo({
      id: msg.id,
      authorName: msg.author.display_name || msg.author.username,
      preview: msg.content_text?.slice(0, 80) || "[mídia]",
    });
  }, []);

  const handleEdit = useCallback((msg: ChatMessage) => {
    useChatStore.getState().setEditingMessage({
      id: msg.id,
      content_text: msg.content_text,
      content_rich_json: msg.content_rich_json,
    });
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 -mx-4 -mt-4 -mb-20 md:-mb-0">
      <ChatHeader
        group={group}
        chapterFilter={chapterFilter}
        onClearFilter={handleClearFilter}
        connected={connected}
      />
      <div className="relative flex-1 min-h-0">
        <MessageList
          ref={scrollRef}
          messages={messages}
          currentUserId={currentUserId}
          isLoading={isLoading}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          typingUsers={typingUsers}
          onDelete={handleDelete}
          onToggleReaction={handleToggleReaction}
          onReply={handleReply}
          onEdit={handleEdit}
        />
        {!isAtBottom && unreadCount > 0 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
            <NewMessagePill
              count={unreadCount}
              onClick={handleScrollToBottom}
            />
          </div>
        )}
      </div>
      <ChatInput
        groupId={groupId}
        onSend={handleSend}
        onTyping={sendTyping}
        onImageSelect={handleImageSelect}
        onSendSpecial={handleSendSpecial}
        disabled={sendMutation.isPending}
      />
    </div>
  );
}
