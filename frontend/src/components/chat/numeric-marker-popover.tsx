"use client";

import { useState } from "react";
import { BookOpen, FileText, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover } from "@/components/ui/popover";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarPopoverContent, onEnterKey } from "./toolbar-popover";
import type { DraftField } from "./toolbar-drafts";
import type { MessageCreatePayload } from "@/lib/types/chat";

export interface NumericMarkerSpec {
  key: string;
  icon: LucideIcon;
  label: string;
  tooltip: string;
  prompt: string;
  placeholder: string;
  payload: (value: number) => Partial<MessageCreatePayload>;
}

/** Marcadores numéricos da toolbar — acrescentar um é acrescentar uma entrada aqui. */
export const NUMERIC_MARKERS: NumericMarkerSpec[] = [
  {
    key: "chapter",
    icon: BookOpen,
    label: "Marcar capítulo",
    tooltip: "Capítulo",
    prompt: "Em qual capítulo?",
    placeholder: "Número do capítulo",
    payload: (value) => ({
      content_type: "chapter_marker",
      content_text: `Capítulo ${value}`,
      reference_type: "chapter",
      reference_value: String(value),
    }),
  },
  {
    key: "page",
    icon: FileText,
    label: "Marcar página",
    tooltip: "Página",
    prompt: "Em qual página?",
    placeholder: "Número da página",
    payload: (value) => ({
      content_type: "page_marker",
      content_text: `Página ${value}`,
      reference_type: "page",
      reference_value: String(value),
    }),
  },
];

interface NumericMarkerPopoverProps {
  spec: NumericMarkerSpec;
  /** Rascunho guardado na toolbar — sobrevive ao recolher. */
  draft: DraftField;
  onSend: (payload: Partial<MessageCreatePayload>) => void;
  /** Chamado depois de enviar, para a toolbar se recolher. */
  onSubmitted?: () => void;
}

export function NumericMarkerPopover({
  spec,
  draft: [value, setValue],
  onSend,
  onSubmitted,
}: NumericMarkerPopoverProps) {
  const [open, setOpen] = useState(false);

  const parsed = parseInt(value, 10);
  const isValid = !isNaN(parsed) && parsed >= 1;
  const Icon = spec.icon;

  function handleSubmit() {
    if (!isValid) return;
    onSend(spec.payload(parsed));
    setValue("");
    setOpen(false);
    onSubmitted?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ToolbarButton label={spec.label} tooltip={spec.tooltip} asPopoverTrigger>
        <Icon className="size-5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarPopoverContent>
        <p className="mb-2 text-sm font-medium">{spec.prompt}</p>
        <Input
          type="number"
          min={1}
          placeholder={spec.placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onEnterKey(handleSubmit)}
          className="mb-2"
          autoFocus
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
