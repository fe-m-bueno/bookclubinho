"use client";

import { type ChatMessage } from "@/lib/types/chat";
import { extractUrls } from "@/lib/url-utils";
import { MessageTextContent } from "./message-text-content";
import { QuoteCard } from "./quote-card";
import { VideoEmbedCard } from "./video-embed-card";
import { LinkPreviewCard } from "./link-preview-card";
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
    case "text": {
      const urls = extractUrls(message.content_text ?? "").slice(0, 3);
      return (
        <>
          <MessageTextContent
            text={message.content_text}
            richJson={message.content_rich_json}
          />
          {urls.length > 0 && (
            <div className="mt-1.5 space-y-1.5">
              {urls.map((url) => (
                <LinkPreviewCard key={url} url={url} />
              ))}
            </div>
          )}
        </>
      );
    }

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
