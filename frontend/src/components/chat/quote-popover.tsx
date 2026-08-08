"use client";

import { useState } from "react";
import { Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarPopoverContent, onEnterKey } from "./toolbar-popover";
import type { DraftField } from "./toolbar-drafts";
import type { MessageCreatePayload } from "@/lib/types/chat";

interface QuotePopoverProps {
  /** Rascunhos guardados na toolbar — sobrevivem ao recolher. */
  textDraft: DraftField;
  pageDraft: DraftField;
  onSend: (payload: Partial<MessageCreatePayload>) => void;
  /** Chamado depois de enviar, para a toolbar se recolher. */
  onSubmitted?: () => void;
}

export function QuotePopover({
  textDraft: [text, setText],
  pageDraft: [page, setPage],
  onSend,
  onSubmitted,
}: QuotePopoverProps) {
  const [open, setOpen] = useState(false);

  const isValid = text.trim().length > 0;

  function handleSubmit() {
    if (!isValid) return;
    onSend({
      content_type: "quote",
      content_text: text.trim(),
      reference_type: "quote",
      reference_value: page.trim() || undefined,
    });
    setText("");
    setPage("");
    setOpen(false);
    onSubmitted?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ToolbarButton
        label="Compartilhar citação"
        tooltip="Citação"
        asPopoverTrigger
      >
        <Quote className="size-5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarPopoverContent className="w-72">
        <p className="type-body mb-2 font-medium">Compartilhar citação</p>
        <Textarea
          placeholder="Citação do livro…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mb-2 min-h-[5rem] resize-none"
          autoFocus
        />
        <Input
          type="number"
          min={1}
          placeholder="Página (opcional)"
          value={page}
          onChange={(e) => setPage(e.target.value)}
          onKeyDown={onEnterKey(handleSubmit)}
          className="mb-2"
        />
        <Button
          size="sm"
          className="w-full"
          onClick={handleSubmit}
          disabled={!isValid}
        >
          Enviar
        </Button>
      </ToolbarPopoverContent>
    </Popover>
  );
}
