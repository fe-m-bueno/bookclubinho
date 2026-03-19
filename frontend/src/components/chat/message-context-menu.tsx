"use client";

import { useRef, type ReactNode } from "react";
import { ContextMenu } from "radix-ui";
import {
  SmilePlus,
  Reply,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ChatMessage } from "@/lib/types/chat";

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isWithinEditWindow(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

interface MessageContextMenuProps {
  message: ChatMessage;
  isOwn: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: () => void;
  onCopy: () => void;
  children: ReactNode;
}

interface MenuItemProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  className?: string;
}

function MenuItem({ icon, label, onClick, destructive, className }: MenuItemProps) {
  return (
    <ContextMenu.Item
      onSelect={onClick}
      className={cn(
        "flex min-h-[44px] cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2 text-sm outline-none transition-colors",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive
          ? "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
          : "text-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className="size-4 shrink-0 [&>svg]:size-4">
        {icon}
      </span>
      {label}
    </ContextMenu.Item>
  );
}

export function MessageContextMenu({
  message,
  isOwn,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onCopy,
  children,
}: MessageContextMenuProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextMenuRef = useRef<HTMLSpanElement>(null);

  // Long-press on mobile: simulate right-click by dispatching a contextmenu event
  function handleTouchStart() {
    longPressTimer.current = setTimeout(() => {
      const el = contextMenuRef.current;
      if (!el) return;
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: el.getBoundingClientRect().x,
        clientY: el.getBoundingClientRect().y,
      });
      el.dispatchEvent(event);
    }, 500);
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  const canEdit =
    isOwn &&
    !message.is_deleted &&
    message.content_type === "text" &&
    isWithinEditWindow(message.created_at);

  function handleCopy() {
    if (message.content_text) {
      navigator.clipboard.writeText(message.content_text).catch(() => {});
    }
    onCopy();
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <span
          ref={contextMenuRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
          className="contents"
        >
          {children}
        </span>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className={cn(
            "z-50 min-w-[180px] overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          {!message.is_deleted && (
            <MenuItem
              icon={<SmilePlus />}
              label="Reagir"
              onClick={onReact}
            />
          )}

          {!message.is_deleted && (
            <MenuItem
              icon={<Reply />}
              label="Responder"
              onClick={onReply}
            />
          )}

          {!message.is_deleted && message.content_text && (
            <MenuItem
              icon={<Copy />}
              label="Copiar texto"
              onClick={handleCopy}
            />
          )}

          {(canEdit || (isOwn && !message.is_deleted)) && (
            <ContextMenu.Separator className="my-1 h-px bg-border" />
          )}

          {canEdit && (
            <MenuItem
              icon={<Pencil />}
              label="Editar"
              onClick={onEdit}
            />
          )}

          {isOwn && !message.is_deleted && (
            <MenuItem
              icon={<Trash2 />}
              label="Apagar"
              onClick={onDelete}
              destructive
            />
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
