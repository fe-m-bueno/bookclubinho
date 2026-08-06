"use client";

import React, { type KeyboardEvent } from "react";
import { PopoverArrow, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Popover da toolbar: abre para cima, com seta, na largura dos formulários curtos.
 */
export function ToolbarPopoverContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  return (
    <PopoverContent
      side="top"
      sideOffset={8}
      className={cn("w-64 rounded-xl", className)}
      {...props}
    >
      {children}
      <PopoverArrow />
    </PopoverContent>
  );
}

/** Enter (sem Shift) confirma o formulário do popover. */
export function onEnterKey(fn: () => void) {
  return (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      fn();
    }
  };
}
