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
    <div className="flex flex-col items-center justify-center py-16 text-center md:py-24">
      {/* Decorative book spines — mini bookshelf illustration */}
      <div className="mb-8 flex items-end gap-1.5 opacity-50 dark:opacity-40">
        <div
          className="h-14 w-3 rounded-sm bg-sage-300 dark:bg-sage-700"
          style={{ transform: "rotate(-3deg)" }}
        />
        <div className="h-20 w-3.5 rounded-sm bg-sage-400 dark:bg-sage-600" />
        <div
          className="h-12 w-3 rounded-sm bg-sage-200 dark:bg-sage-800"
          style={{ transform: "rotate(2deg)" }}
        />
        <div
          className="h-[72px] w-3 rounded-sm bg-sage-300 dark:bg-sage-700"
          style={{ transform: "rotate(-1deg)" }}
        />
        <div
          className="h-10 w-3.5 rounded-sm bg-sage-200 dark:bg-sage-800"
          style={{ transform: "rotate(4deg)" }}
        />
      </div>

      <h2 className="text-2xl font-display font-bold tracking-tight md:text-3xl">
        Sua estante espera
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Todo grande clube do livro começa com o primeiro membro. Crie o seu ou
        entre em um com um código de convite.
      </p>

      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Button className="w-full gap-2" size="lg" onClick={onCreateGroup}>
          <Users className="h-4 w-4" />
          Criar clube
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2"
          size="lg"
          onClick={onJoinGroup}
        >
          <BookOpen className="h-4 w-4" />
          Entrar com código
        </Button>
      </div>
    </div>
  );
}
