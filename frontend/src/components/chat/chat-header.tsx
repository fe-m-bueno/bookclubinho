"use client";

import { MessageCircle } from "lucide-react";
import type { ChatSSEStatus } from "@/hooks/use-chat-sse";
import type { GroupDetailResponse } from "@/lib/types/group";
import { ChapterFilterChip } from "./chapter-filter-chip";

interface ChatHeaderProps {
  group: GroupDetailResponse;
  chapterFilter: number | null;
  onClearFilter: () => void;
  sseStatus: ChatSSEStatus;
}

export function ChatHeader({
  group,
  chapterFilter,
  onClearFilter,
  sseStatus,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <MessageCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        <h2 className="text-sm font-semibold truncate">Chat</h2>
        <span className="text-xs text-muted-foreground">
          {group.member_count} membro{group.member_count !== 1 ? "s" : ""}
        </span>
        {/* "connecting" é o estado normal logo que o chat abre — só uma
            queda de verdade (já esteve conectado e caiu) merece aviso. */}
        {sseStatus === "disconnected" && (
          <span className="text-xs text-destructive">Reconectando...</span>
        )}
      </div>
      {chapterFilter != null && (
        <ChapterFilterChip chapter={chapterFilter} onClear={onClearFilter} />
      )}
    </div>
  );
}
