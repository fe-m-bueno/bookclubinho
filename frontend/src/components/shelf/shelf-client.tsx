"use client";

import { Button } from "@/components/ui/button";
import { useGroup } from "@/lib/contexts/group-context";
import { useShelf } from "@/hooks/use-shelf";
import { ShareButton } from "@/app/shelf/[id]/share-button";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { ShelfSkeleton } from "./shelf-skeleton";
import { ShelfEmptyState } from "./shelf-empty-state";
import { ShelfGrid } from "./shelf-grid";

export function ShelfClient() {
  const { group } = useGroup();
  const { data, loading, error, refetch } = useShelf(group.id);

  const { showSkeleton } = useSkeletonState(loading);
  if (showSkeleton) return <ShelfSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button type="button" onClick={refetch}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const books = data?.books ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {books.length} livro{books.length !== 1 ? "s" : ""} lido
          {books.length !== 1 ? "s" : ""}
        </p>
        <ShareButton shelfId={group.id} label="Compartilhar estante" />
      </div>

      {books.length === 0 ? (
        <ShelfEmptyState groupId={group.id} showCta />
      ) : (
        <ShelfGrid books={books} groupId={group.id} />
      )}
    </div>
  );
}
