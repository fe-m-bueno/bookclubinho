import { cache } from "react";
import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ShelfGrid } from "@/components/shelf/shelf-grid";
import { ShelfEmptyState } from "@/components/shelf/shelf-empty-state";
import type { ShelfResponse } from "@/lib/types/shelf";
import { ShareButton } from "./share-button";

// cache() deduplicates concurrent calls within the same request
// (generateMetadata + page component both call this)
const fetchPublicShelf = cache(async (id: string): Promise<ShelfResponse | null> => {
  try {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const res = await fetch(`${apiUrl}/api/v1/shelf/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<ShelfResponse>;
  } catch {
    return null;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const shelf = await fetchPublicShelf(id);

  if (!shelf) {
    return { title: "Estante" };
  }

  const bookCount = shelf.books.length;
  const latestBook = shelf.books[0]?.book_title;
  const description = `${bookCount} livro${bookCount !== 1 ? "s" : ""} lido${bookCount !== 1 ? "s" : ""}${latestBook ? ` · Último: ${latestBook}` : ""}`;

  return {
    title: `Estante do ${shelf.group_name}`,
    description,
    openGraph: {
      title: `Estante do ${shelf.group_name}`,
      description,
      images: [`/api/og/shelf/${id}`],
    },
  };
}

export default async function PublicShelfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shelf = await fetchPublicShelf(id);

  if (!shelf) {
    notFound();
  }

  const bookCount = shelf.books.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="flex items-center gap-4">
            {shelf.group_photo_url ? (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl shadow-md">
                <Image
                  src={shelf.group_photo_url}
                  alt={`Foto do grupo ${shelf.group_name}`}
                  fill
                  className="object-cover"
                  sizes="64px"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sage-100 dark:bg-sage-900 text-2xl shadow-warm-md">
                📚
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-display font-bold truncate">{shelf.group_name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span>
                  {bookCount} livro{bookCount !== 1 ? "s" : ""} lido
                  {bookCount !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  Clube do livro
                </span>
              </div>
            </div>

            <ShareButton shelfId={id} />
          </div>
        </div>
      </header>

      {/* Shelf content */}
      <main className="mx-auto max-w-4xl px-4 py-8">
        {bookCount === 0 ? (
          <ShelfEmptyState />
        ) : (
          <ShelfGrid books={shelf.books} />
        )}
      </main>
    </div>
  );
}
