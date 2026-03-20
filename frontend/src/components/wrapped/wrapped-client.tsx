"use client";

import { useRouter } from "next/navigation";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWrapped } from "@/hooks/use-wrapped";
import { useGenerateWrapped } from "@/hooks/use-generate-wrapped";
import { WrappedStories } from "./wrapped-stories";

interface WrappedClientProps {
  groupId: string;
  year: number;
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors"
      aria-label="Fechar"
    >
      <X className="h-5 w-5" />
    </button>
  );
}

export function WrappedClient({ groupId, year }: WrappedClientProps) {
  const router = useRouter();
  const { data, loading, error, refetch } = useWrapped(groupId, year);
  const { generate, loading: generating, error: generateError } = useGenerateWrapped();

  async function handleGenerate() {
    const result = await generate(groupId, year);
    if (result) {
      refetch();
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4">
        <Skeleton className="w-48 h-8 rounded-full" />
        <Skeleton className="w-64 h-4 rounded-full" />
        <Skeleton className="w-32 h-4 rounded-full" />
      </div>
    );
  }

  if (data) {
    if (data.data.total_books_read === 0) {
      return (
        <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4 p-8 text-center">
          <CloseButton onClick={() => router.push(`/groups/${groupId}`)} />
          <p className="text-2xl">📚</p>
          <h2 className="text-xl font-semibold">Nenhum livro finalizado em {year}</h2>
          <p className="text-muted-foreground">
            O grupo ainda não terminou nenhum livro este ano.
          </p>
        </div>
      );
    }
    return <WrappedStories data={data.data} groupId={groupId} year={year} />;
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-6 p-8 text-center">
      <CloseButton onClick={() => router.push(`/groups/${groupId}`)} />
      <div className="text-5xl">✨</div>
      <h1 className="text-3xl font-bold">Wrapped {year}</h1>
      <p className="text-muted-foreground max-w-sm">
        Reviva os melhores momentos do clube do livro em {year}.
      </p>
      {generateError && (
        <p className="text-destructive text-sm">{generateError}</p>
      )}
      {error && (
        <>
          <p className="text-destructive text-sm">{error}</p>
          <Button variant="ghost" size="sm" onClick={refetch}>
            Tentar novamente
          </Button>
        </>
      )}
      <Button
        size="lg"
        className="gap-2"
        onClick={handleGenerate}
        disabled={generating}
      >
        <Sparkles className="h-5 w-5" />
        {generating ? "Gerando..." : `Gerar Wrapped ${year}`}
      </Button>
    </div>
  );
}
