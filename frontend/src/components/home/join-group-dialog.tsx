"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGroupCodeCheck } from "@/hooks/use-group-code-check";
import { ensureCsrf, withCsrf } from "@/lib/csrf";

interface JoinGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinGroupDialog({ open, onOpenChange }: JoinGroupDialogProps) {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const router = useRouter();
  const inputId = useId();

  const { status, group } = useGroupCodeCheck(code);

  const handleJoin = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      await ensureCsrf();
      const res = await fetch("/api/v1/groups/join", {
        method: "POST",
        credentials: "include",
        headers: withCsrf({ "Content-Type": "application/json" }),
        body: JSON.stringify({ invite_code: code }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setJoinError(data.detail ?? "Erro ao entrar no clube.");
        return;
      }

      const data = await res.json();
      onOpenChange(false);
      router.push(`/groups/${data.group_id}`);
    } catch {
      setJoinError("Erro de conexão. Tente novamente.");
    } finally {
      setJoining(false);
    }
  };

  const handleCodeChange = (value: string) => {
    setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8));
    setJoinError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Entrar em um clube</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>Código de convite</Label>
            <Input
              id={inputId}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="Ex: ABCD2345"
              maxLength={8}
              className="font-mono tracking-widest uppercase"
              autoComplete="off"
            />
          </div>

          {/* Validation feedback */}
          {status === "checking" && (
            <p className="text-sm text-muted-foreground">Verificando...</p>
          )}
          {status === "valid" && group && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-bold">
                {group.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium">{group.name}</p>
                <p className="text-xs text-muted-foreground">
                  {group.member_count} membro{group.member_count !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          )}
          {status === "not_found" && (
            <p className="text-sm text-destructive">
              Código inválido ou clube não encontrado.
            </p>
          )}
          {joinError && (
            <p className="text-sm text-destructive">{joinError}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={joining}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleJoin}
            disabled={status !== "valid" || joining}
          >
            {joining ? "Entrando..." : "Entrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
