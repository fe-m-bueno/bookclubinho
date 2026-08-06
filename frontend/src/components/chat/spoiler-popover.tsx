"use client";

import { useState } from "react";
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover } from "@/components/ui/popover";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarPopoverContent } from "./toolbar-popover";
import type { DraftField } from "./toolbar-drafts";

interface SpoilerPopoverProps {
  /** Fica na toolbar: o botão continua destacado depois que o popover fecha. */
  isSpoiler: boolean;
  /** Rascunho guardado na toolbar — sobrevive ao recolher. */
  chapterDraft: DraftField;
  onIsSpoilerChange: (isSpoiler: boolean) => void;
  onConfirm: (chapter: number | null) => void;
  /** Chamado depois de confirmar, para a toolbar se recolher. */
  onSubmitted?: () => void;
}

export function SpoilerPopover({
  isSpoiler,
  chapterDraft: [chapter, setChapter],
  onIsSpoilerChange,
  onConfirm,
  onSubmitted,
}: SpoilerPopoverProps) {
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    const parsed = parseInt(chapter, 10);
    onConfirm(isNaN(parsed) ? null : parsed);
    setOpen(false);
    onSubmitted?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ToolbarButton
        label="Marcar spoiler"
        tooltip="Spoiler"
        active={isSpoiler}
        asPopoverTrigger
      >
        <EyeOff className="size-5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarPopoverContent>
        <p className="mb-3 text-sm font-medium">Configurar spoiler</p>
        <label className="mb-3 flex cursor-pointer select-none items-center gap-2">
          <input
            type="checkbox"
            checked={isSpoiler}
            onChange={(e) => onIsSpoilerChange(e.target.checked)}
            className="size-4 rounded accent-sage-500"
          />
          <span className="text-sm">Marcar como spoiler</span>
        </label>
        {isSpoiler ? (
          <Input
            type="number"
            min={1}
            placeholder="Capítulo (opcional)"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            className="mb-3"
          />
        ) : null}
        <Button size="sm" className="w-full" onClick={handleConfirm}>
          Confirmar
        </Button>
      </ToolbarPopoverContent>
    </Popover>
  );
}
