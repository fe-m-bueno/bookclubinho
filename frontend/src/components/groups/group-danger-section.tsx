"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import type { GroupDetailResponse } from "@/lib/types/group";

interface GroupDangerSectionProps {
  group: GroupDetailResponse;
  isAdmin: boolean;
}

export function GroupDangerSection({ group, isAdmin }: GroupDangerSectionProps) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");

  const { submit: submitDelete, loading: deleteLoading } = useAuthSubmit({
    url: `/api/v1/groups/${group.id}`,
    method: "DELETE",
    onSuccess: () => {
      toast.success("Clube excluído.");
      router.push("/");
    },
  });

  const { submit: submitLeave, loading: leaveLoading } = useAuthSubmit({
    url: `/api/v1/groups/${group.id}/leave`,
    method: "POST",
    onSuccess: () => {
      toast.success("Você saiu do clube.");
      router.push("/");
    },
  });

  return (
    <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-4 border border-destructive/30">
      <h3 className="font-semibold text-destructive">Zona de perigo</h3>

      {isAdmin ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full h-11">
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir grupo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Excluir grupo permanentemente?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todos os dados do grupo serão
                perdidos. Digite{" "}
                <span className="font-semibold">{group.name}</span> para
                confirmar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={group.name}
              className="mt-2"
            />
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmName("")}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmName !== group.name || deleteLoading}
                onClick={() => submitDelete("")}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteLoading ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full h-11">
              <LogOut className="mr-2 h-4 w-4" />
              Sair do grupo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sair do grupo?</AlertDialogTitle>
              <AlertDialogDescription>
                Você precisará de um novo convite para entrar novamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={leaveLoading}
                onClick={() => submitLeave("")}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {leaveLoading ? "Saindo..." : "Sair"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
