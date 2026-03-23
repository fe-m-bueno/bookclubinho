"use client";

import { FileText } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type ChatMessage } from "@/lib/types/chat";
import { getAuthorName, getAuthorInitials } from "@/lib/chat-utils";

interface PageMarkerCardProps {
  message: ChatMessage;
}

export function PageMarkerCard({ message }: PageMarkerCardProps) {
  const page = message.reference_value;

  return (
    <div className="w-full rounded-r-lg border-l-4 border-sage-400 bg-muted/50 p-3">
      <div className="flex items-center gap-2">
        <FileText
          className="size-4 shrink-0 text-sage-600 dark:text-sage-300"
          aria-hidden="true"
        />

        <Avatar className="size-5 shrink-0">
          <AvatarImage
            src={message.author.avatar_url ?? undefined}
            alt={getAuthorName(message.author)}
          />
          <AvatarFallback className="text-[10px]">
            {getAuthorInitials(message.author)}
          </AvatarFallback>
        </Avatar>

        <span className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {getAuthorName(message.author)}
          </span>{" "}
          está na página{" "}
          <span className="font-semibold text-sage-700 dark:text-sage-300">
            {page ?? "—"}
          </span>
        </span>
      </div>
    </div>
  );
}
