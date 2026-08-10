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
    path: `/rounds/${roundId}/nominations/${nomination.id}`,
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
      className="flex gap-3 rounded-2xl border bg-card p-3 shadow-warm-sm"
    >
      {/* Cover */}
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
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
          <div className="type-meta flex h-full items-center justify-center">
            —
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Era Fraunces com corte de display num tamanho de corpo, o mesmo
            defeito que a fatia 1 tirou da home: o título do livro é corpo, e
            a serifa fica com o título de verdade. */}
        <p className="type-body line-clamp-1">{nomination.book_title}</p>
        {nomination.book_author && (
          <p className="type-meta">{nomination.book_author}</p>
        )}
        <p className="type-meta">
          Indicado por <span className="text-foreground">{nominatorName}</span>
        </p>
        {nomination.pitch && (
          <p className="type-meta mt-1 line-clamp-2 italic">
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
                  onClick={() => submit()}
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
