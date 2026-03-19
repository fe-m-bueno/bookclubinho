"use client";

import React, { useEffect, useRef, type RefObject } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { cn } from "@/lib/utils";

export interface TiptapEditorHandle {
  /** Programmatically trigger a send (used by the external send button). */
  triggerSend: () => void;
}

interface TiptapEditorProps {
  onSend: (text: string, richJson: Record<string, unknown>) => void;
  initialContent?: string;
  disabled?: boolean;
  placeholder?: string;
  onTyping?: () => void;
  /** Receives an imperative handle so the parent can call triggerSend(). */
  handleRef?: RefObject<TiptapEditorHandle | null>;
}

const MAX_CHARS = 4000;
const WARN_CHARS = 3500;

export function TiptapEditor({
  onSend,
  initialContent,
  disabled = false,
  placeholder = "Mensagem…",
  onTyping,
  handleRef,
}: TiptapEditorProps) {
  // Use a stable ref so callbacks inside useEditor config can access the
  // latest onSend/onTyping without being recreated.
  const onSendRef = useRef(onSend);
  const onTypingRef = useRef(onTyping);
  useEffect(() => { onSendRef.current = onSend; }, [onSend]);
  useEffect(() => { onTypingRef.current = onTyping; }, [onTyping]);

  // editorRef lets handleKeyDown reach the Editor instance without closure staleness.
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        autolink: true,
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
    ],
    content: initialContent ?? "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "outline-none min-h-[2.5rem] max-h-[9rem] overflow-y-auto",
        "data-testid": "tiptap-editor",
      },
      handleKeyDown(_view, event) {
        const ed = editorRef.current;

        // Shift+Enter: let the default newline through
        if (event.key === "Enter" && event.shiftKey) {
          return false;
        }

        // Plain Enter: submit
        if (event.key === "Enter" && !event.shiftKey) {
          if (!ed) return false;

          const text = ed.state.doc.textContent.trim();
          if (!text) return true; // swallow enter on empty editor

          if (text.length > MAX_CHARS) return true; // block send over limit

          const json = ed.getJSON() as Record<string, unknown>;
          onSendRef.current(text, json);

          // Clear on next tick — let Tiptap finish its own key handling first
          setTimeout(() => {
            ed.commands.clearContent(true);
          }, 0);

          return true;
        }

        return false;
      },
    },
    onUpdate({ editor: e }) {
      // Sync editorRef on every update
      editorRef.current = e;
      if (!e.state.doc.textContent) return;
      onTypingRef.current?.();
    },
    onCreate({ editor: e }) {
      editorRef.current = e;
    },
  });

  // Keep editorRef up-to-date when useEditor resolves
  useEffect(() => {
    if (editor) editorRef.current = editor;
  }, [editor]);

  // Sync initialContent when it changes (edit mode)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = initialContent ?? "";
    if (current !== incoming) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent]); // intentionally omit `editor` — we only re-run on content change

  // Toggle editable when disabled prop changes
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Expose imperative handle so the parent send button can trigger submission
  useEffect(() => {
    if (!handleRef) return;
    (handleRef as React.MutableRefObject<TiptapEditorHandle | null>).current = {
      triggerSend() {
        const ed = editorRef.current;
        if (!ed) return;
        const text = ed.state.doc.textContent.trim();
        if (!text || text.length > MAX_CHARS) return;
        const json = ed.getJSON() as Record<string, unknown>;
        onSendRef.current(text, json);
        setTimeout(() => ed.commands.clearContent(true), 0);
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleRef]);

  const charCount = editor?.state.doc.textContent.length ?? 0;
  const isOverLimit = charCount > MAX_CHARS;
  const showCount = charCount > WARN_CHARS;

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "border rounded-xl px-3 py-2 bg-background transition-shadow",
          "focus-within:ring-2 focus-within:ring-brand-500",
          isOverLimit && "border-destructive focus-within:ring-destructive/50",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        <EditorContent editor={editor} />
      </div>

      {showCount && (
        <p
          className={cn(
            "self-end text-xs tabular-nums",
            isOverLimit ? "text-destructive" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {charCount.toLocaleString("pt-BR")}/{MAX_CHARS.toLocaleString("pt-BR")}
        </p>
      )}
    </div>
  );
}
