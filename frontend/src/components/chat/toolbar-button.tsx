"use client";

import React from "react";
import { PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Estilo compartilhado por todos os botões da toolbar — um lugar só. */
const TOOLBAR_BUTTON_CLASS = cn(
  "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

interface ToolbarButtonProps {
  label: string;
  tooltip: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  /** Reflete o estado de expansão no `aria-expanded` (botão de toggle). */
  expanded?: boolean;
  /** Renderiza como trigger do Popover pai — precisa estar dentro de <Popover>. */
  asPopoverTrigger?: boolean;
  children: React.ReactNode;
}

/**
 * Botão de ícone de 40px com tooltip.
 * Com `asPopoverTrigger`, abre o Popover que o envolve.
 */
export function ToolbarButton({
  label,
  tooltip,
  onClick,
  disabled = false,
  active = false,
  expanded,
  asPopoverTrigger = false,
  children,
}: ToolbarButtonProps) {
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        TOOLBAR_BUTTON_CLASS,
        disabled
          ? "cursor-not-allowed opacity-40"
          : active
            ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {asPopoverTrigger ? (
          <PopoverTrigger asChild>{button}</PopoverTrigger>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
