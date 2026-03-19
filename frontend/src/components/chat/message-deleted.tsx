"use client";

import { Trash2 } from "lucide-react";

export function MessageDeleted() {
  return (
    <span className="flex items-center gap-1.5 text-sm italic text-muted-foreground">
      <Trash2 className="size-3.5 shrink-0" aria-hidden="true" />
      Mensagem apagada
    </span>
  );
}
