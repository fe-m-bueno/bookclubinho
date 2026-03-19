"use client";

import { type ChatMessage } from "@/lib/types/chat";
import { MessageTextContent } from "./message-text-content";
import { QuoteCard } from "./quote-card";
import { VideoEmbedCard } from "./video-embed-card";
import { ChapterMarkerCard } from "./chapter-marker-card";
import { PageMarkerCard } from "./page-marker-card";

interface MessageContentProps {
  message: ChatMessage;
}

/**
 * Renders the body of a message by switching on `content_type`.
 *
 * Chapter/page markers are also handled here for the inline bubble case —
 * the MessageList may additionally render them full-width outside of a
 * MessageGroup, but this component covers the case where a marker arrives
 * inside the bubble rendering path.
 */
export function MessageContent({ message }: MessageContentProps) {
  switch (message.content_type) {
    case "text":
      return (
        <MessageTextContent
          text={message.content_text}
          richJson={message.content_rich_json}
        />
      );

    case "image":
      return message.media_url ? (
        <button
          type="button"
          className="cursor-zoom-in overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() =>
            window.open(message.media_url!, "_blank", "noopener,noreferrer")
          }
          aria-label="Abrir imagem em tamanho completo"
        >
          <img
            src={message.media_url}
            alt={message.content_text ?? "Imagem"}
            className="max-w-[280px] rounded-xl object-cover"
            loading="lazy"
          />
        </button>
      ) : null;

    case "gif":
      return message.media_url ? (
        <button
          type="button"
          className="cursor-zoom-in overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() =>
            window.open(message.media_url!, "_blank", "noopener,noreferrer")
          }
          aria-label="Abrir GIF em tamanho completo"
        >
          <img
            src={message.media_url}
            alt={message.content_text ?? "GIF"}
            className="max-w-[200px] rounded-xl"
            loading="lazy"
          />
        </button>
      ) : null;

    case "video_link":
      return (
        <VideoEmbedCard
          url={message.media_url ?? message.content_text ?? ""}
        />
      );

    case "quote":
      return <QuoteCard message={message} />;

    case "chapter_marker":
      return <ChapterMarkerCard message={message} />;

    case "page_marker":
      return <PageMarkerCard message={message} />;

    case "system":
      return (
        <p className="text-sm italic text-muted-foreground">
          {message.content_text}
        </p>
      );

    default:
      return null;
  }
}
