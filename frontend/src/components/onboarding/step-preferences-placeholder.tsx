"use client";

import { Button } from "@/components/ui/button";

interface StepPreferencesPlaceholderProps {
  onNext: () => void;
  onBack: () => void;
}

export function StepPreferencesPlaceholder({ onNext, onBack }: StepPreferencesPlaceholderProps) {
  return (
    <div className="space-y-6 text-center py-8">
      <div>
        <p className="text-4xl" aria-hidden="true">
          📖
        </p>
        <h2 className="text-lg font-semibold mt-3">Preferências de leitura</h2>
        <p className="text-sm text-muted-foreground mt-1">Em breve...</p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 h-11" onClick={onBack}>
          Voltar
        </Button>
        <Button className="flex-1 h-11" onClick={onNext}>
          Próximo
        </Button>
      </div>
    </div>
  );
}
