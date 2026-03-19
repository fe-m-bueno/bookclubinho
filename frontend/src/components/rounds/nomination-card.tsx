"use client";

import Image from "next/image";
import { Trash2, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import { toast } from "sonner";
import type { NominationSummary } from "@/lib/types/round";

interface NominationCardProps {
  nomination: NominationSummary;
  nominatorName: string;
  currentUserId: string;
  roundId: string;
  onRemoved: () => void;
}

export function NominationCard({
  nomination,
  nominatorName,
  currentUserId,
  roundId,
  onRemoved,
}: NominationCardProps) {
  const isOwn = nomination.user_id === currentUserId;

  const { submit, loading } = useAuthSubmit({
    url: `/api/v1/rounds/${roundId}/nominations/${nomination.id}`,
    method: "DELETE",
    onSuccess: async () => {
      toast.success("Indicação removida.");
      onRemoved();
    },
    statusHandlers: [
      {
        status: 403,
        handler: async () => {
          toast.error("Você só pode remover suas próprias indicações.");
        },
      },
    ],
  });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="flex gap-3 rounded-xl border bg-card p-3"
    >
      {/* Cover */}
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {nomination.book_cover_url ? (
          <Image
            src={nomination.book_cover_url}
            alt={`Capa de ${nomination.book_title}`}
            fill
            className="object-cover"
            sizes="48px"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
            —
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium text-sm leading-tight line-clamp-1">
          {nomination.book_title}
        </p>
        {nomination.book_author && (
          <p className="text-xs text-muted-foreground">{nomination.book_author}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Indicado por <span className="font-medium">{nominatorName}</span>
        </p>
        {nomination.pitch && (
          <p className="mt-1 text-xs text-foreground/80 line-clamp-2 italic">
            &ldquo;{nomination.pitch}&rdquo;
          </p>
        )}
      </div>

      {/* Remove (own only) */}
      {isOwn && (
        <div className="shrink-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remover indicação"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Remover indicação?</AlertDialogTitle>
                <AlertDialogDescription>
                  &ldquo;{nomination.book_title}&rdquo; será removido das indicações desta rodada.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => submit("")}
                >
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </motion.div>
  );
}
