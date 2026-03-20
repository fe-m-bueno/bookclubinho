"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

const LABELS = [
  "Sem nota",
  "Meh",
  "Ok",
  "Gostei",
  "Amei",
  "Obra-prima",
];

interface StepStarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  onNext: () => void;
  noMotion?: boolean;
}

export function StepStarRating({
  value,
  onChange,
  onNext,
  noMotion = false,
}: StepStarRatingProps) {

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <h2 className="text-lg font-semibold">Que nota você dá?</h2>

      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <motion.button
            key={star}
            type="button"
            whileTap={noMotion ? {} : { scale: 0.85 }}
            whileHover={noMotion ? {} : { scale: 1.1 }}
            transition={
              noMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 400, damping: 20 }
            }
            onClick={() => onChange(star === value ? 0 : star)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
          >
            <Star
              className={`h-10 w-10 transition-colors ${
                star <= value
                  ? "fill-amber-400 text-amber-400"
                  : "fill-none text-muted-foreground"
              }`}
            />
          </motion.button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground h-5">
        {LABELS[value]}
      </p>

      <Button
        onClick={onNext}
        className="w-full max-w-xs min-h-[44px]"
      >
        Continuar
      </Button>
    </div>
  );
}
