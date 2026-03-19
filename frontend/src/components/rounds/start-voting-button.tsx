"use client";

import { Loader2, Vote } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import { toast } from "sonner";
import type { NominationSummary } from "@/lib/types/round";

interface StartVotingButtonProps {
  roundId: string;
  nominations: NominationSummary[];
  onSuccess: () => void;
}

export function StartVotingButton({
  roundId,
  nominations,
  onSuccess,
}: StartVotingButtonProps) {
  const canStart = nominations.length >= 2;

  const { submit, loading } = useAuthSubmit({
    url: `/api/v1/rounds/${roundId}/start-voting`,
    onSuccess: async () => {
      toast.success("Votação iniciada!");
      onSuccess();
    },
    statusHandlers: [
      {
        status: 409,
        handler: async () => {
          toast.error("Não foi possível iniciar a votação.");
        },
      },
    ],
  });

  const button = (
    <Button
      variant="default"
      className="w-full min-h-[44px]"
      disabled={!canStart || loading}
      aria-disabled={!canStart}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Vote className="h-4 w-4" />
      )}
      Iniciar Votação
    </Button>
  );

  return (
    <div className="pt-2">
      {canStart ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Iniciar votação?</AlertDialogTitle>
              <AlertDialogDescription>
                A fase de indicações será encerrada e os membros poderão votar
                entre as {nominations.length} indicações.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => submit("")}>
                Iniciar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block w-full" tabIndex={0}>
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Mínimo de 2 indicações para iniciar a votação</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
