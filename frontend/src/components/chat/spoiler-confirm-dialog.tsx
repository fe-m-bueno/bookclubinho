"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useChatStore } from "@/stores/chat-store";

interface SpoilerConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spoilerChapter: number | null;
  viewerChapter: number | null;
  messageId: string;
}

export function SpoilerConfirmDialog({
  open,
  onOpenChange,
  spoilerChapter,
  viewerChapter,
  messageId,
}: SpoilerConfirmDialogProps) {
  function handleReveal() {
    useChatStore.getState().revealSpoiler(messageId);
    onOpenChange(false);
  }

  const description =
    viewerChapter != null
      ? `Esse spoiler é do capítulo ${spoilerChapter ?? "?"}. Você está no capítulo ${viewerChapter}. Revelar mesmo?`
      : "Você ainda não registrou progresso. Revelar mesmo?";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Revelar spoiler?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Não</AlertDialogCancel>
          <AlertDialogAction onClick={handleReveal}>
            Sim, revelar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
