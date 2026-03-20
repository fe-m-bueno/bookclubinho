import Link from "next/link";
import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShelfEmptyStateProps {
  groupId?: string;
  showCta?: boolean;
}

export function ShelfEmptyState({ groupId, showCta }: ShelfEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Library className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">
          Nenhum livro na estante ainda
        </p>
        <p className="text-sm text-muted-foreground">
          Termine uma rodada para ver os livros aqui — comece uma rodada!
        </p>
      </div>
      {showCta && groupId && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/groups/${groupId}/round`}>Ir para a Rodada</Link>
        </Button>
      )}
    </div>
  );
}
