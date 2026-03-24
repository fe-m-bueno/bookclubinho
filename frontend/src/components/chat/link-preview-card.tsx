"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Image from "next/image";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { Skeleton } from "@/components/ui/skeleton";

interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

interface LinkPreviewCardProps {
  url: string;
}

async function fetchPreview(url: string): Promise<LinkPreviewData> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/link-preview?url=${encodeURIComponent(url)}`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error("preview unavailable");
  return res.json();
}

/**
 * Renders an Open Graph preview card for a URL.
 * Falls back to a plain link card while loading or on error.
 */
export function LinkPreviewCard({ url }: LinkPreviewCardProps) {
  const { data, isLoading, isError } = useQuery<LinkPreviewData>({
    queryKey: ["link-preview", url],
    queryFn: () => fetchPreview(url),
    staleTime: 24 * 60 * 60 * 1000, // 24h — matches backend TTL
    retry: false,
  });

  let displayUrl: string;
  try {
    const parsed = new URL(url);
    displayUrl = parsed.hostname.replace(/^www\./, "") + parsed.pathname;
  } catch {
    displayUrl = url;
  }

  const { showSkeleton } = useSkeletonState(isLoading);
  if (showSkeleton) {
    return (
      <div className="flex gap-3 rounded-lg border border-border bg-muted p-3">
        <Skeleton className="size-4 shrink-0 self-center rounded" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-3/4 rounded" />
          <Skeleton className="h-3 w-full rounded" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    // Fallback — plain link card (same as VideoEmbedCard)
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
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {displayUrl}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">Abrir ↗</span>
      </a>
    );
  }

  const hasImage = Boolean(data.image);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-lg border border-border bg-muted transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Abrir link externo: ${data.title ?? url}`}
    >
      {hasImage && (
        <div className="relative h-[160px] w-full overflow-hidden bg-muted-foreground/10">
          <Image
            src={data.image!}
            alt={data.title ?? ""}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 400px"
            unoptimized
          />
        </div>
      )}
      <div className="flex items-start gap-3 p-3">
        {!hasImage && (
          <ExternalLink
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          {data.site_name && (
            <p className="truncate text-xs text-muted-foreground">
              {data.site_name}
            </p>
          )}
          {data.title && (
            <p className="truncate text-sm font-medium text-foreground">
              {data.title}
            </p>
          )}
          {data.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {data.description}
            </p>
          )}
          {!data.title && !data.description && (
            <p className="truncate text-sm text-foreground">{displayUrl}</p>
          )}
        </div>
        <span className="shrink-0 self-center text-xs text-muted-foreground">
          ↗
        </span>
      </div>
    </a>
  );
}
