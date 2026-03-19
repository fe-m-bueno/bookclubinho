"use client";

import React, {
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Camera,
  Film,
  BookOpen,
  FileText,
  Quote,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MessageCreatePayload } from "@/lib/types/chat";

/* ------------------------------------------------------------------ */
/* Inline Popover primitives (popover.tsx not yet in ui/)              */
/* ------------------------------------------------------------------ */

function PopoverContent({
  className,
  children,
  sideOffset = 8,
  side,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        side={side}
        className={cn(
          "z-50 w-64 rounded-xl border bg-popover p-4 text-popover-foreground shadow-md outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      >
        {children}
        <PopoverPrimitive.Arrow className="fill-popover" />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Small toolbar icon button                                            */
/* ------------------------------------------------------------------ */

interface ToolbarButtonProps {
  label: string;
  tooltip: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  // When true, renders as PopoverTrigger.asChild instead of a plain button
  asPopoverTrigger?: boolean;
}

/**
 * A standalone 40px icon button with tooltip.
 * When used inside a Popover, pass asPopoverTrigger and wrap with PopoverPrimitive.Root.
 */
function ToolbarButton({
  label,
  tooltip,
  onClick,
  disabled = false,
  active = false,
  children,
}: Omit<ToolbarButtonProps, "asPopoverTrigger">) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            disabled
              ? "cursor-not-allowed opacity-40"
              : active
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Same visual as ToolbarButton but renders as a Popover trigger.
 * Must be a direct child of <PopoverPrimitive.Root>.
 */
function PopoverToolbarButton({
  label,
  tooltip,
  active = false,
  children,
}: Omit<ToolbarButtonProps, "onClick" | "disabled" | "asPopoverTrigger">) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {children}
          </button>
        </PopoverPrimitive.Trigger>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar props                                                        */
/* ------------------------------------------------------------------ */

interface InputToolbarProps {
  groupId: string;
  onImageSelect: (file: File) => void;
  onSendSpecial: (payload: Partial<MessageCreatePayload>) => void;
  onSpoilerChange?: (isSpoiler: boolean, chapter: number | null) => void;
}

/* ------------------------------------------------------------------ */
/* Main component                                                       */
/* ------------------------------------------------------------------ */

export function InputToolbar({
  groupId: _groupId,
  onImageSelect,
  onSendSpecial,
  onSpoilerChange,
}: InputToolbarProps) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chapter marker state
  const [chapterOpen, setChapterOpen] = useState(false);
  const [chapterNum, setChapterNum] = useState("");

  // Page marker state
  const [pageOpen, setPageOpen] = useState(false);
  const [pageNum, setPageNum] = useState("");

  // Quote state
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [quotePage, setQuotePage] = useState("");

  // Spoiler state
  const [spoilerOpen, setSpoilerOpen] = useState(false);
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [spoilerChapter, setSpoilerChapter] = useState("");

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelect(file);
      setOpen(false);
    }
    e.target.value = "";
  }

  function handleChapterSubmit() {
    const num = parseInt(chapterNum, 10);
    if (isNaN(num) || num < 1) return;
    onSendSpecial({
      content_type: "chapter_marker",
      content_text: `Capítulo ${num}`,
      reference_type: "chapter",
      reference_value: String(num),
    });
    setChapterNum("");
    setChapterOpen(false);
    setOpen(false);
  }

  function handlePageSubmit() {
    const num = parseInt(pageNum, 10);
    if (isNaN(num) || num < 1) return;
    onSendSpecial({
      content_type: "page_marker",
      content_text: `Página ${num}`,
      reference_type: "page",
      reference_value: String(num),
    });
    setPageNum("");
    setPageOpen(false);
    setOpen(false);
  }

  function handleQuoteSubmit() {
    if (!quoteText.trim()) return;
    onSendSpecial({
      content_type: "quote",
      content_text: quoteText.trim(),
      reference_type: "quote",
      reference_value: quotePage.trim() || undefined,
    });
    setQuoteText("");
    setQuotePage("");
    setQuoteOpen(false);
    setOpen(false);
  }

  function handleSpoilerConfirm() {
    const raw = parseInt(spoilerChapter, 10);
    const chapter = isNaN(raw) ? null : raw;
    onSpoilerChange?.(isSpoiler, chapter);
    setSpoilerOpen(false);
    setOpen(false);
  }

  function onEnterKey(fn: () => void) {
    return (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        fn();
      }
    };
  }

  return (
    <TooltipProvider>
      <div className="flex items-center">
        {/* Toggle button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={open ? "Fechar ferramentas" : "Abrir ferramentas"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <motion.div
                animate={{ rotate: open ? 45 : 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                aria-hidden="true"
              >
                <Plus className="size-5" />
              </motion.div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{open ? "Fechar" : "Mais opções"}</p>
          </TooltipContent>
        </Tooltip>

        {/* Expanded toolbar */}
        <AnimatePresence>
          {open && (
            <motion.div
              key="toolbar"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="flex items-center overflow-hidden"
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
                <ToolbarButton label="Enviar GIF (em breve)" tooltip="Em breve" disabled>
                  <Film className="size-5" aria-hidden="true" />
                </ToolbarButton>

                {/* Chapter marker */}
                <PopoverPrimitive.Root open={chapterOpen} onOpenChange={setChapterOpen}>
                  <PopoverToolbarButton label="Marcar capítulo" tooltip="Capítulo">
                    <BookOpen className="size-5" aria-hidden="true" />
                  </PopoverToolbarButton>
                  <PopoverContent side="top">
                    <p className="mb-2 text-sm font-medium">Em qual capítulo?</p>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Número do capítulo"
                      value={chapterNum}
                      onChange={(e) => setChapterNum(e.target.value)}
                      onKeyDown={onEnterKey(handleChapterSubmit)}
                      className="mb-2"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleChapterSubmit}
                      disabled={!chapterNum || parseInt(chapterNum, 10) < 1}
                    >
                      Enviar
                    </Button>
                  </PopoverContent>
                </PopoverPrimitive.Root>

                {/* Page marker */}
                <PopoverPrimitive.Root open={pageOpen} onOpenChange={setPageOpen}>
                  <PopoverToolbarButton label="Marcar página" tooltip="Página">
                    <FileText className="size-5" aria-hidden="true" />
                  </PopoverToolbarButton>
                  <PopoverContent side="top">
                    <p className="mb-2 text-sm font-medium">Em qual página?</p>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Número da página"
                      value={pageNum}
                      onChange={(e) => setPageNum(e.target.value)}
                      onKeyDown={onEnterKey(handlePageSubmit)}
                      className="mb-2"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handlePageSubmit}
                      disabled={!pageNum || parseInt(pageNum, 10) < 1}
                    >
                      Enviar
                    </Button>
                  </PopoverContent>
                </PopoverPrimitive.Root>

                {/* Quote */}
                <PopoverPrimitive.Root open={quoteOpen} onOpenChange={setQuoteOpen}>
                  <PopoverToolbarButton label="Compartilhar citação" tooltip="Citação">
                    <Quote className="size-5" aria-hidden="true" />
                  </PopoverToolbarButton>
                  <PopoverContent side="top" className="w-72">
                    <p className="mb-2 text-sm font-medium">Compartilhar citação</p>
                    <Textarea
                      placeholder="Citação do livro…"
                      value={quoteText}
                      onChange={(e) => setQuoteText(e.target.value)}
                      className="mb-2 min-h-[5rem] resize-none"
                      autoFocus
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Página (opcional)"
                      value={quotePage}
                      onChange={(e) => setQuotePage(e.target.value)}
                      onKeyDown={onEnterKey(handleQuoteSubmit)}
                      className="mb-2"
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleQuoteSubmit}
                      disabled={!quoteText.trim()}
                    >
                      Enviar
                    </Button>
                  </PopoverContent>
                </PopoverPrimitive.Root>

                {/* Spoiler toggle */}
                <PopoverPrimitive.Root open={spoilerOpen} onOpenChange={setSpoilerOpen}>
                  <PopoverToolbarButton
                    label="Marcar spoiler"
                    tooltip="Spoiler"
                    active={isSpoiler}
                  >
                    <EyeOff className="size-5" aria-hidden="true" />
                  </PopoverToolbarButton>
                  <PopoverContent side="top">
                    <p className="mb-3 text-sm font-medium">Configurar spoiler</p>
                    <label className="mb-3 flex cursor-pointer select-none items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSpoiler}
                        onChange={(e) => setIsSpoiler(e.target.checked)}
                        className="size-4 rounded accent-brand-500"
                      />
                      <span className="text-sm">Marcar como spoiler</span>
                    </label>
                    {isSpoiler && (
                      <Input
                        type="number"
                        min={1}
                        placeholder="Capítulo (opcional)"
                        value={spoilerChapter}
                        onChange={(e) => setSpoilerChapter(e.target.value)}
                        className="mb-3"
                      />
                    )}
                    <Button size="sm" className="w-full" onClick={handleSpoilerConfirm}>
                      Confirmar
                    </Button>
                  </PopoverContent>
                </PopoverPrimitive.Root>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
