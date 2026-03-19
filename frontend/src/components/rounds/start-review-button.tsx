"use client";

import { Loader2, BookOpenCheck } from "lucide-react";
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
import { useAuthSubmit, JSON_HEADERS } from "@/hooks/use-auth-submit";
import { toast } from "sonner";

interface StartReviewButtonProps {
  roundId: string;
  onStarted: () => void;
}

export function StartReviewButton({
  roundId,
  onStarted,
}: StartReviewButtonProps) {
  const { submit, loading } = useAuthSubmit({
    url: `/api/v1/rounds/${roundId}/start-review`,
    headers: JSON_HEADERS,
    onSuccess: async () => {
      toast.success("Fase de reviews iniciada!");
      onStarted();
    },
    statusHandlers: [
      {
        status: 409,
        handler: async () => {
          toast.error("Não foi possível iniciar a fase de reviews.");
        },
      },
    ],
  });

  const button = (
    <Button
      variant="default"
      className="w-full min-h-[44px]"
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <BookOpenCheck className="h-4 w-4" />
      )}
      Abrir Reviews
    </Button>
  );

  return (
    <div className="pt-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Abrir fase de reviews?</AlertDialogTitle>
            <AlertDialogDescription>
              A fase de leitura será encerrada e os membros poderão submeter
              suas reviews.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => submit(JSON.stringify({}))}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
