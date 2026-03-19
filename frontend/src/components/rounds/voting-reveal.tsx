"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactConfetti from "react-confetti";
import { Button } from "@/components/ui/button";
import { VotingCard } from "./voting-card";
import { useWindowSize } from "@/hooks/use-window-size";
import type { NominationSummary } from "@/lib/types/round";
import type { MemberSummary } from "@/lib/types/group";

interface VotingRevealProps {
  nominations: NominationSummary[];
  winnerNominationId: string;
  wasTiebreak: boolean;
  members: MemberSummary[];
  onComplete: () => void;
}

type RevealStep = "idle" | "highlight" | "headline" | "confetti" | "counts" | "done";

export function VotingReveal({
  nominations,
  winnerNominationId,
  wasTiebreak,
  members,
  onComplete,
}: VotingRevealProps) {
  const { width, height } = useWindowSize();
  const [step, setStep] = useState<RevealStep>("idle");

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStep("highlight"), 500));
    timers.push(setTimeout(() => setStep("headline"), 1000));
    timers.push(setTimeout(() => setStep("confetti"), 1500));
    timers.push(setTimeout(() => setStep("counts"), 2000));
    timers.push(setTimeout(() => setStep("done"), 3500));
    return () => timers.forEach(clearTimeout);
  }, []);

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members],
  );
  const isRevealed = step === "counts" || step === "done";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {(step === "confetti" || step === "counts" || step === "done") && (
        <ReactConfetti
          width={width}
          height={height}
          recycle={false}
          numberOfPieces={250}
          style={{ position: "fixed", top: 0, left: 0, zIndex: 50 }}
        />
      )}

      <AnimatePresence>
        {(step === "headline" ||
          step === "confetti" ||
          step === "counts" ||
          step === "done") && (
          <motion.div
            key="headline"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-1"
          >
            <p className="text-2xl font-bold">
              {wasTiebreak ? "O destino escolheu!" : "O grupo decidiu!"}
            </p>
            {wasTiebreak && (
              <p className="text-sm text-muted-foreground">
                Houve empate — o vencedor foi sorteado.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {nominations.map((nomination) => {
          const member = memberMap.get(nomination.user_id);
          const nominatorName =
            member?.display_name ?? member?.username ?? "Membro";
          const nominatorAvatarUrl = member?.avatar_url ?? null;
          const isWinner = nomination.id === winnerNominationId;
          const shouldHighlight = step !== "idle";

          return (
            <motion.div
              key={nomination.id}
              animate={
                shouldHighlight
                  ? isWinner
                    ? { scale: 1.03, opacity: 1 }
                    : { scale: 1, opacity: isRevealed ? 0.6 : 0.35 }
                  : { scale: 1, opacity: 1 }
              }
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <VotingCard
                nomination={nomination}
                nominatorName={nominatorName}
                nominatorAvatarUrl={nominatorAvatarUrl}
                isSelected={false}
                isRevealed={isRevealed}
                isWinner={isWinner && isRevealed}
                disabled
                onVote={() => undefined}
              />
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {step === "done" && (
          <motion.div
            key="continue"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-2"
          >
            <Button className="w-full min-h-[44px]" onClick={onComplete}>
              Continuar
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
