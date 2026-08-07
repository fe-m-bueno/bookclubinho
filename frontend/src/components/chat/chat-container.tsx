"use client";

import { useCallback, useMemo, useRef } from "react";
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
import { useViewerChapter } from "@/hooks/use-viewer-chapter";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { NewMessagePill } from "./new-message-pill";
import { ReactionPicker } from "./reaction-picker";
import type { ChatMessage, MessageCreatePayload } from "@/lib/types/chat";

interface ChatContainerProps {
  groupId: string;
}

export function ChatContainer({ groupId }: ChatContainerProps) {
  const { group } = useGroup();
  const currentUserId = group.current_user_id;
  const currentMember = group.members.find((m) => m.user_id === currentUserId);
  const currentUserName =
    currentMember?.display_name || currentMember?.username || "Você";
  const currentUserAvatar = currentMember?.avatar_url ?? null;

  const chapterFilter = useChatStore((s) => s.chapterFilter);
  const isAtBottom = useChatStore((s) => s.isAtBottom);
  const unreadCount = useChatStore((s) => s.unreadCount);
  const editingMessage = useChatStore((s) => s.editingMessage);
  const replyTo = useChatStore((s) => s.replyTo);
  const reactionPickerState = useChatStore((s) => s.reactionPickerState);

  const {
    messages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useChatMessages({ groupId, chapterFilter });

  const { status: sseStatus } = useChatSSE({ groupId, currentUserId });
  const viewerChapter = useViewerChapter(groupId, currentUserId);
  const { sendTyping, typingUsers } = useTypingIndicator(
    groupId,
    currentUserId,
  );

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
  const chatAreaRef = useRef<HTMLDivElement>(null);

  const handleSend = useCallback(
    async (text: string, richJson: Record<string, unknown>) => {
      if (editingMessage) {
        try {
          await editMutation.mutateAsync({
            messageId: editingMessage.id,
            payload: { content_text: text, content_rich_json: richJson },
          });
          useChatStore.getState().setEditingMessage(null);
          return true;
        } catch {
          return false;
        }
      }

      const payload: MessageCreatePayload = {
        content_type: "text",
        content_text: text,
        content_rich_json: richJson,
        parent_message_id: replyTo?.id ?? null,
      };

      try {
        await sendMutation.mutateAsync(payload);
        useChatStore.getState().setReplyTo(null);
        scrollRef.current?.scrollToBottom();
        return true;
      } catch {
        // Erro visível já é responsabilidade do toast em `useSendMessage`; o
        // editor decide, a partir do retorno, se preserva o texto do usuário.
        return false;
      }
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
          media_key: result.media_key,
          thumbnail_key: result.thumbnail_key,
          previewUrl: result.media_url,
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

  // Calculate absolute position of the reaction picker relative to chatAreaRef.
  // The picker is rendered as a sibling of MessageList (outside overflow-y-auto),
  // so it is never clipped by the scroll container.
  const pickerStyle = useMemo(() => {
    if (!reactionPickerState || !chatAreaRef.current) return null;
    const { rect, isOwn } = reactionPickerState;
    const area = chatAreaRef.current.getBoundingClientRect();
    // Quick picker bar is ~52px tall; flip to open below if not enough space above
    const spaceAbove = rect.top - area.top;
    const GAP = 8;
    const vertical =
      spaceAbove > 60
        ? { bottom: area.bottom - rect.top + GAP }
        : { top: rect.bottom - area.top + GAP };
    const horizontal = isOwn
      ? { right: area.right - rect.right }
      : { left: rect.left - area.left };
    return { ...vertical, ...horizontal };
  }, [reactionPickerState]);

  return (
    // `-mb-20` compensava a barra fixa do rodapé, que não existe mais; `flex-1`
    // no lugar de `h-full` porque o pai agora divide a altura com o controle
    // segmentado — com `h-full` o chat pediria a altura toda e estouraria.
    <div className="flex min-h-0 flex-1 flex-col -mx-4">
      <ChatHeader
        group={group}
        chapterFilter={chapterFilter}
        onClearFilter={handleClearFilter}
        sseStatus={sseStatus}
      />
      {/* `flex flex-col` e não só `relative`: a `MessageList` é `flex-1
          overflow-y-auto`, e num pai que não é flex container esse `flex-1`
          não vale nada — a lista crescia com o conteúdo em vez de rolar
          dentro, empurrando o campo de escrever para fora da tela. */}
      <div ref={chatAreaRef} className="relative flex min-h-0 flex-1 flex-col">
        <MessageList
          ref={scrollRef}
          messages={messages}
          currentUserId={currentUserId}
          isLoading={isLoading}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          typingUsers={typingUsers}
          viewerChapter={viewerChapter}
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

        {reactionPickerState && pickerStyle && (
          <ReactionPicker
            style={pickerStyle}
            onSelect={(emoji) =>
              handleToggleReaction(reactionPickerState.messageId, emoji)
            }
            onClose={() => useChatStore.getState().closeReactionPicker()}
          />
        )}
      </div>
      <ChatInput
        onSend={handleSend}
        onTyping={sendTyping}
        onImageSelect={handleImageSelect}
        onSendSpecial={handleSendSpecial}
        disabled={sendMutation.isPending}
      />
    </div>
  );
}
