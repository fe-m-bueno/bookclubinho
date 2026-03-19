import { BookOpen } from "lucide-react";

export function NominationEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <BookOpen className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground">Nenhuma indicação ainda</p>
        <p className="text-sm text-muted-foreground">
          Busque um livro e faça a primeira indicação!
        </p>
      </div>
    </div>
  );
}
