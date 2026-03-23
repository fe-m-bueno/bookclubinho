"use client";

import { useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, X, Pencil, Reply } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { TiptapEditor, type TiptapEditorHandle } from "./tiptap-editor";
import { InputToolbar } from "./input-toolbar";
import { UploadProgressBar } from "./upload-progress-bar";
import { cn } from "@/lib/utils";
import type { MessageCreatePayload } from "@/lib/types/chat";

interface ChatInputProps {
  groupId: string;
  onSend: (text: string, richJson: Record<string, unknown>) => void;
  onTyping: () => void;
  onImageSelect: (file: File) => void;
  onSendSpecial: (payload: Partial<MessageCreatePayload>) => void;
  onSpoilerChange?: (isSpoiler: boolean, chapter: number | null) => void;
  disabled?: boolean;
}

export function ChatInput({
  groupId,
  onSend,
  onTyping,
  onImageSelect,
  onSendSpecial,
  onSpoilerChange,
  disabled = false,
}: ChatInputProps) {
  const replyTo = useChatStore((s) => s.replyTo);
  const editingMessage = useChatStore((s) => s.editingMessage);
  const uploadProgress = useChatStore((s) => s.uploadProgress);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);

  // Imperative handle to trigger send from the external button
  const editorHandleRef = useRef<TiptapEditorHandle | null>(null);

  const handleSend = useCallback(
    (text: string, richJson: Record<string, unknown>) => {
      onSend(text, richJson);
      if (editingMessage) setEditingMessage(null);
      if (replyTo) setReplyTo(null);
    },
    [editingMessage, onSend, replyTo, setEditingMessage, setReplyTo],
  );

  // Build initial content for edit mode
  const editorInitialContent = editingMessage?.content_text ?? undefined;

  return (
    <div
      className={cn(
        "border-t bg-background px-3 pt-2 pb-3",
        "flex flex-col gap-1.5",
      )}
    >
      {/* Reply-to banner */}
      <AnimatePresence>
        {replyTo && !editingMessage && (
          <motion.div
            key="reply-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
              <Reply className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {replyTo.authorName}
                </p>
                <p className="truncate text-xs text-muted-foreground">{replyTo.preview}</p>
              </div>
              <button
                type="button"
                aria-label="Cancelar resposta"
                onClick={() => setReplyTo(null)}
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editing banner */}
      <AnimatePresence>
        {editingMessage && (
          <motion.div
            key="edit-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-lg bg-sage-100/60 px-3 py-1.5 dark:bg-sage-900/40">
              <Pencil
                className="size-3.5 shrink-0 text-sage-600 dark:text-sage-400"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-sage-700 dark:text-sage-300">
                Editando mensagem
              </p>
              <button
                type="button"
                aria-label="Cancelar edição"
                onClick={() => setEditingMessage(null)}
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-sage-600 transition-colors hover:bg-sage-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sage-400 dark:hover:bg-sage-800/40"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor row */}
      <div className="flex items-end gap-2">
        {/* Toolbar toggle + expanded action buttons */}
        <InputToolbar
          groupId={groupId}
          onImageSelect={onImageSelect}
          onSendSpecial={onSendSpecial}
          onSpoilerChange={onSpoilerChange}
        />

        {/* Rich text editor */}
        <div className="min-w-0 flex-1">
          <TiptapEditor
            onSend={handleSend}
            initialContent={editorInitialContent}
            disabled={disabled}
            placeholder={editingMessage ? "Editar mensagem…" : "Mensagem…"}
            onTyping={onTyping}
            handleRef={editorHandleRef}
          />
        </div>

        {/* Send button — 44px touch target */}
        <button
          type="button"
          aria-label="Enviar mensagem"
          onClick={() => editorHandleRef.current?.triggerSend()}
          disabled={disabled}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground shadow-sm",
            "transition-all duration-150",
            "hover:bg-primary/90 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <Send className="size-5" aria-hidden="true" />
        </button>
      </div>

      {/* Upload progress */}
      <AnimatePresence>
        {uploadProgress !== null && uploadProgress > 0 && (
          <motion.div
            key="upload-progress"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <UploadProgressBar progress={uploadProgress} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
