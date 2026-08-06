"use client";

import { Loader2, CheckCircle } from "lucide-react";
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
import type { FinalizeResponse } from "@/lib/types/round";

interface FinalizeVotingButtonProps {
  roundId: string;
  onFinalized: (result: FinalizeResponse) => void;
}

export function FinalizeVotingButton({
  roundId,
  onFinalized,
}: FinalizeVotingButtonProps) {
  const { submit, loading } = useAuthSubmit({
    path: `/rounds/${roundId}/finalize`,
    onSuccess: async (data: FinalizeResponse) => {
      toast.success("Votação encerrada!");
      onFinalized(data);
    },
    statusHandlers: [
      {
        status: 409,
        handler: async () => {
          toast.error("Não foi possível encerrar a votação.");
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
        <CheckCircle className="h-4 w-4" />
      )}
      Encerrar Votação
    </Button>
  );

  return (
    <div className="pt-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar votação?</AlertDialogTitle>
            <AlertDialogDescription>
              Os votos serão contados e o livro vencedor será revelado.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => submit({})}>
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
