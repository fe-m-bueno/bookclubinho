"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Camera, Film } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  NUMERIC_MARKERS,
  NumericMarkerPopover,
} from "./numeric-marker-popover";
import { QuotePopover } from "./quote-popover";
import { SpoilerPopover } from "./spoiler-popover";
import { ToolbarButton } from "./toolbar-button";
import { useToolbarDrafts } from "./toolbar-drafts";
import type { MessageCreatePayload } from "@/lib/types/chat";

interface InputToolbarProps {
  onImageSelect: (file: File) => void;
  onSendSpecial: (payload: Partial<MessageCreatePayload>) => void;
  onSpoilerChange?: (isSpoiler: boolean, chapter: number | null) => void;
}

export function InputToolbar({
  onImageSelect,
  onSendSpecial,
  onSpoilerChange,
}: InputToolbarProps) {
  const [open, setOpen] = useState(false);
  const [isSpoiler, setIsSpoiler] = useState(false);
  const draft = useToolbarDrafts();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelect(file);
      setOpen(false);
    }
    e.target.value = "";
  }

  const collapse = () => setOpen(false);

  return (
    <TooltipProvider>
      <div className="flex items-center">
        {/* Toggle button */}
        <ToolbarButton
          label={open ? "Fechar ferramentas" : "Abrir ferramentas"}
          tooltip={open ? "Fechar" : "Mais opções"}
          expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <motion.div
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            aria-hidden="true"
          >
            <Plus className="size-5" />
          </motion.div>
        </ToolbarButton>

        {/* Expanded toolbar */}
        <AnimatePresence>
          {open ? (
            <motion.div
              key="toolbar"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex items-center"
            >
              <div className="flex items-center gap-0.5 pl-1">
                {/* Image */}
                <ToolbarButton
                  label="Enviar imagem"
                  tooltip="Imagem"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="size-5" aria-hidden="true" />
                </ToolbarButton>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={handleFileChange}
                />

                {/* GIF — placeholder */}
                <ToolbarButton
                  label="Enviar GIF (em breve)"
                  tooltip="Em breve"
                  disabled
                >
                  <Film className="size-5" aria-hidden="true" />
                </ToolbarButton>

                {/* Chapter / page markers */}
                {NUMERIC_MARKERS.map((spec) => (
                  <NumericMarkerPopover
                    key={spec.key}
                    spec={spec}
                    draft={draft(spec.key)}
                    onSend={onSendSpecial}
                    onSubmitted={collapse}
                  />
                ))}

                <QuotePopover
                  textDraft={draft("quote:text")}
                  pageDraft={draft("quote:page")}
                  onSend={onSendSpecial}
                  onSubmitted={collapse}
                />

                <SpoilerPopover
                  isSpoiler={isSpoiler}
                  chapterDraft={draft("spoiler:chapter")}
                  onIsSpoilerChange={setIsSpoiler}
                  onConfirm={(chapter) => onSpoilerChange?.(isSpoiler, chapter)}
                  onSubmitted={collapse}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
