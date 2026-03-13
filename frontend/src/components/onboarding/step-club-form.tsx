"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  Plus,
  SearchX,
  UserPlus,
  Users,
} from "lucide-react";
import ReactConfetti from "react-confetti";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import { formatInviteCode } from "@/lib/format-invite-code";
import {
  useGroupCodeCheck,
  type GroupCodeStatus,
} from "@/hooks/use-group-code-check";

function stripDashes(formatted: string): string {
  return formatted.replace(/-/g, "");
}

interface StepClubFormProps {
  onBack: () => void;
}

export function StepClubForm({ onBack }: StepClubFormProps) {
  const router = useRouter();
  const [codeInput, setCodeInput] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTargetRef = useRef("/");

  const rawCode = stripDashes(codeInput);
  const { status, group } = useGroupCodeCheck(rawCode);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  function celebrateAndRedirect(target: string) {
    setShowConfetti(true);
    redirectTimerRef.current = setTimeout(() => {
      router.push(target);
    }, 2500);
  }

  const { submit: submitComplete, loading: completing } = useAuthSubmit({
    url: "/api/v1/onboarding/complete",
    onSuccess: () => celebrateAndRedirect(redirectTargetRef.current),
  });

  const { submit: submitJoin, loading: joining } = useAuthSubmit({
    url: "/api/v1/groups/join",
    onSuccess: async () => {
      redirectTargetRef.current = "/";
      await submitComplete(JSON.stringify({}));
    },
    statusHandlers: [
      { status: 409, handler: () => toast.error("Você já faz parte deste clube.") },
      { status: 403, handler: () => toast.error("Este clube está cheio.") },
      { status: 404, handler: () => toast.error("Clube não encontrado.") },
    ],
  });

  async function handleJoin() {
    submitJoin(JSON.stringify({ invite_code: rawCode }));
  }

  function handleCreate() {
    redirectTargetRef.current = "/groups/create";
    submitComplete(JSON.stringify({}));
  }

  function handleSkip() {
    redirectTargetRef.current = "/";
    submitComplete(JSON.stringify({}));
  }

  const isLoading = joining || completing;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Entre em um clube</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Use um código de convite ou crie seu próprio clube.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Join */}
        <div className="rounded-xl border border-border bg-background p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h3 className="font-medium">Tenho um código</h3>
          </div>

          <div className="relative">
            <Input
              value={codeInput}
              onChange={(e) => setCodeInput(formatInviteCode(e.target.value))}
              placeholder="ABCD-EFGH"
              className="h-12 font-mono text-center uppercase tracking-widest text-lg"
              maxLength={9}
              aria-label="Código de convite"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <StatusIcon status={status} />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {status === "valid" && group && (
              <motion.div
                key="group-info"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
              >
                {group.photo_url ? (
                  <img
                    src={group.photo_url}
                    alt={group.name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.member_count}{" "}
                    {group.member_count === 1 ? "membro" : "membros"}
                  </p>
                </div>
              </motion.div>
            )}

            {status === "not_found" && (
              <motion.p
                key="not-found"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-destructive text-center"
              >
                Clube não encontrado.
              </motion.p>
            )}
          </AnimatePresence>

          <Button
            className="w-full h-11"
            disabled={status !== "valid" || isLoading}
            onClick={handleJoin}
          >
            {joining ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Entrar"
            )}
          </Button>
        </div>

        {/* Card 2: Create */}
        <div className="rounded-xl border border-border bg-background p-5 space-y-4 flex flex-col">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <h3 className="font-medium">Criar novo clube</h3>
          </div>
          <p className="text-sm text-muted-foreground flex-1">
            Crie seu próprio clube do livro e convide seus amigos para
            participar.
          </p>
          <Button
            variant="outline"
            className="w-full h-11"
            disabled={isLoading}
            onClick={handleCreate}
          >
            {completing && !joining ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Criar clube"
            )}
          </Button>
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full h-11"
        onClick={onBack}
        disabled={isLoading}
      >
        Voltar
      </Button>

      <div className="text-center">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
          onClick={handleSkip}
          disabled={isLoading}
        >
          Pular por agora
        </button>
      </div>

      {showConfetti && (
        <ReactConfetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={200}
          style={{ position: "fixed", top: 0, left: 0, zIndex: 50 }}
        />
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: GroupCodeStatus }) {
  if (status === "checking") {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }
  if (status === "valid") {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
  if (status === "not_found") {
    return <SearchX className="h-4 w-4 text-destructive" />;
  }
  return null;
}
