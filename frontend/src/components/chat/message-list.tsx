"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { differenceInMinutes, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import type { ChatMessage, TypingUser } from "@/lib/types/chat";
import { ChatSkeleton } from "./chat-skeleton";
import { MessageGroup } from "./message-group";
import { TimestampSeparator } from "./timestamp-separator";
import { ChapterMarkerCard } from "./chapter-marker-card";
import { PageMarkerCard } from "./page-marker-card";
import { TypingIndicator } from "./typing-indicator";

interface MessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  typingUsers: TypingUser[];
  /** Current reading chapter of the viewer — used for spoiler auto-reveal */
  viewerChapter?: number | null;
  onDelete: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
}

export interface MessageListHandle {
  scrollToBottom: () => void;
}

interface MessageGroupData {
  key: string;
  authorId: string;
  messages: ChatMessage[];
}

function groupMessages(messages: ChatMessage[]): Array<
  | { type: "separator"; timestamp: string; key: string }
  | { type: "marker"; message: ChatMessage; key: string }
  | { type: "group"; group: MessageGroupData; key: string }
> {
  const items: Array<
    | { type: "separator"; timestamp: string; key: string }
    | { type: "marker"; message: ChatMessage; key: string }
    | { type: "group"; group: MessageGroupData; key: string }
  > = [];

  let currentGroup: MessageGroupData | null = null;

  const flushGroup = () => {
    if (currentGroup && currentGroup.messages.length > 0) {
      items.push({ type: "group", group: currentGroup, key: currentGroup.key });
      currentGroup = null;
    }
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Insert timestamp separator if gap > 30 minutes from previous message
    if (i > 0) {
      const prev = messages[i - 1];
      const gap = differenceInMinutes(
        parseISO(msg.created_at),
        parseISO(prev.created_at),
      );
      if (gap > 30) {
        flushGroup();
        items.push({
          type: "separator",
          timestamp: msg.created_at,
          key: `sep-${msg.created_at}`,
        });
      }
    } else {
      // First message always gets a separator
      items.push({
        type: "separator",
        timestamp: msg.created_at,
        key: `sep-${msg.created_at}`,
      });
    }

    // Chapter/page markers are full-width, not grouped
    if (
      msg.content_type === "chapter_marker" ||
      msg.content_type === "page_marker"
    ) {
      flushGroup();
      items.push({ type: "marker", message: msg, key: `marker-${msg.id}` });
      continue;
    }

    // Group consecutive messages from the same sender within 2 minutes
    if (currentGroup) {
      const lastMsg =
        currentGroup.messages[currentGroup.messages.length - 1];
      const sameAuthor = msg.author.user_id === currentGroup.authorId;
      const withinWindow =
        differenceInMinutes(
          parseISO(msg.created_at),
          parseISO(lastMsg.created_at),
        ) <= 2;

      if (sameAuthor && withinWindow) {
        currentGroup.messages.push(msg);
        continue;
      }

      flushGroup();
    }

    currentGroup = {
      key: `group-${msg.id}`,
      authorId: msg.author.user_id,
      messages: [msg],
    };
  }

  flushGroup();
  return items;
}

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(
  function MessageList(
    {
      messages,
      currentUserId,
      isLoading,
      isFetchingNextPage,
      hasNextPage,
      fetchNextPage,
      typingUsers,
      viewerChapter,
      onDelete,
      onToggleReaction,
      onReply,
      onEdit,
    },
    ref,
  ) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const didInitialScroll = useRef(false);
    const prevMessageCount = useRef(0);

    // Expose scrollToBottom to parent
    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        const el = scrollContainerRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
          useChatStore.getState().setIsAtBottom(true);
          useChatStore.getState().setUnreadCount(0);
        }
      },
    }));

    // Track isAtBottom
    const handleScroll = useCallback(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      const store = useChatStore.getState();
      if (store.isAtBottom !== atBottom) {
        store.setIsAtBottom(atBottom);
        if (atBottom) store.setUnreadCount(0);
      }
    }, []);

    // Initial scroll to bottom
    useEffect(() => {
      if (!isLoading && messages.length > 0 && !didInitialScroll.current) {
        didInitialScroll.current = true;
        const el = scrollContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }
    }, [isLoading, messages.length]);

    // Auto-scroll on new message from self
    useEffect(() => {
      if (messages.length > prevMessageCount.current && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        const isOwnMsg = lastMsg.author.user_id === currentUserId;
        if (isOwnMsg || useChatStore.getState().isAtBottom) {
          const el = scrollContainerRef.current;
          if (el) {
            requestAnimationFrame(() => {
              el.scrollTop = el.scrollHeight;
            });
          }
        }
      }
      prevMessageCount.current = messages.length;
    }, [messages.length, currentUserId, messages]);

    // Intersection observer for infinite scroll up
    useEffect(() => {
      const sentinel = sentinelRef.current;
      if (!sentinel) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        },
        {
          root: scrollContainerRef.current,
          rootMargin: "100px",
        },
      );

      observer.observe(sentinel);
      return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const items = useMemo(() => groupMessages(messages), [messages]);

    if (isLoading) {
      return (
        <div className="flex-1 overflow-y-auto">
          <ChatSkeleton />
        </div>
      );
    }

    return (
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {/* Sentinel for infinite scroll up */}
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />

        {isFetchingNextPage && (
          <div className="flex justify-center py-3">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">Nenhuma mensagem ainda.</p>
            <p className="text-xs mt-1">Seja o primeiro a enviar!</p>
          </div>
        )}

        <div className="flex flex-col gap-3 px-4 py-3">
          {items.map((item) => {
            if (item.type === "separator") {
              return (
                <TimestampSeparator
                  key={item.key}
                  timestamp={item.timestamp}
                />
              );
            }
            if (item.type === "marker") {
              if (item.message.content_type === "chapter_marker") {
                return (
                  <ChapterMarkerCard
                    key={item.key}
                    message={item.message}
                  />
                );
              }
              return (
                <PageMarkerCard key={item.key} message={item.message} />
              );
            }
            // type === "group"
            const isOwn =
              item.group.authorId === currentUserId;
            return (
              <MessageGroup
                key={item.key}
                messages={item.group.messages}
                isOwn={isOwn}
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

        {/* Typing indicator at the bottom */}
        <TypingIndicator users={typingUsers} />
      </div>
    );
  },
);
