"use client";

import { useCallback, useState } from "react";

/**
 * Um campo de formulário que se lê e escreve como `useState`, mas cujo valor
 * mora acima do popover.
 */
export type DraftField = readonly [
  value: string,
  setValue: (value: string) => void,
];

/**
 * Recolher a toolbar desmonta os popovers, e o que o usuário digitou não pode
 * ir embora com eles. Os rascunhos ficam num estado só, na toolbar; cada
 * popover recebe o campo que é seu e não sabe onde ele é guardado.
 */
export function useToolbarDrafts() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  return useCallback(
    (key: string): DraftField => [
      drafts[key] ?? "",
      (value: string) => setDrafts((all) => ({ ...all, [key]: value })),
    ],
    [drafts],
  );
}
