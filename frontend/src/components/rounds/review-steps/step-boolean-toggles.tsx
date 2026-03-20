"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface ToggleOption {
  key: string;
  label: string;
  emojiYes: string;
  emojiNo: string;
}

const TOGGLES: ToggleOption[] = [
  { key: "cried", label: "Chorou?", emojiYes: "\uD83D\uDE22", emojiNo: "\uD83D\uDE0E" },
  { key: "loved_it", label: "Amou?", emojiYes: "\uD83D\uDE0D", emojiNo: "\uD83D\uDE10" },
  {
    key: "felt_aroused",
    label: "Ficou com tes\u00E3o?",
    emojiYes: "\uD83E\uDD75",
    emojiNo: "\uD83D\uDE07",
  },
  {
    key: "found_heavy",
    label: "Achou pesado?",
    emojiYes: "\uD83C\uDFCB\uFE0F",
    emojiNo: "\uD83E\uDEB6",
  },
  {
    key: "wants_more_from_author",
    label: "Quer mais do autor?",
    emojiYes: "\uD83D\uDCDA",
    emojiNo: "\u270B",
  },
];

interface StepBooleanTogglesProps {
  values: Record<string, boolean>;
  onChange: (key: string, value: boolean) => void;
  onNext: () => void;
  onBack: () => void;
  noMotion?: boolean;
}

export function StepBooleanToggles({
  values,
  onChange,
  onNext,
  onBack,
  noMotion = false,
}: StepBooleanTogglesProps) {

  return (
    <div className="flex flex-col gap-6 py-4">
      <h2 className="text-lg font-semibold text-center">
        Como foi a experiência?
      </h2>

      <div className="grid grid-cols-2 gap-3">
        {TOGGLES.map((toggle) => {
          const isYes = values[toggle.key] ?? false;
          return (
            <motion.button
              key={toggle.key}
              type="button"
              whileTap={noMotion ? {} : { scale: 0.95 }}
              transition={
                noMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 400, damping: 25 }
              }
              onClick={() => onChange(toggle.key, !isYes)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 min-h-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isYes
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              }`}
            >
              <span className="text-2xl">
                {isYes ? toggle.emojiYes : toggle.emojiNo}
              </span>
              <span className="text-sm font-medium">{toggle.label}</span>
              <span
                className={`text-xs ${
                  isYes ? "text-primary font-semibold" : "text-muted-foreground"
                }`}
              >
                {isYes ? "Sim" : "Não"}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 min-h-[44px]"
        >
          Voltar
        </Button>
        <Button onClick={onNext} className="flex-1 min-h-[44px]">
          Continuar
        </Button>
      </div>
    </div>
  );
}
