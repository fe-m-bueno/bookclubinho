"use client";

import { ExternalLink } from "lucide-react";

interface VideoEmbedCardProps {
  url: string;
}

/**
 * Renders a clean link card for video/external URLs — primarily Twitter/X.
 * Avoids oEmbed fetches to prevent CORS issues and keeps the bundle lean.
 */
export function VideoEmbedCard({ url }: VideoEmbedCardProps) {
  let displayUrl: string;
  try {
    const parsed = new URL(url);
    displayUrl = parsed.hostname.replace(/^www\./, "") + parsed.pathname;
  } catch {
    displayUrl = url;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border bg-muted p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Abrir link externo: ${url}`}
    >
      <ExternalLink
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">
          {displayUrl}
        </span>
      </span>

      <span className="shrink-0 text-xs text-muted-foreground">
        Abrir ↗
      </span>
    </a>
  );
}
