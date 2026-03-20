"use client";

import { BookOpen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HomeEmptyStateProps {
  onCreateGroup: () => void;
  onJoinGroup: () => void;
}

export function HomeEmptyState({
  onCreateGroup,
  onJoinGroup,
}: HomeEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-5xl">
        📚
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">
          Seu cantinho de leitura está vazio
        </h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Crie um clube para ler com amigos ou entre em um existente com um
          código de convite.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button className="w-full gap-2" onClick={onCreateGroup}>
          <Users className="h-4 w-4" />
          Criar clube
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={onJoinGroup}
        >
          <BookOpen className="h-4 w-4" />
          Entrar com código
        </Button>
      </div>
    </div>
  );
}
