"use client";

import { Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReviewData {
  star_rating: number;
  cried: boolean;
  loved_it: boolean;
  felt_aroused: boolean;
  found_heavy: boolean;
  wants_more_from_author: boolean;
  sincere_review: string;
  funny_oneliner: string;
  extra_thoughts: string;
}

const BOOL_LABELS: { key: keyof ReviewData; label: string; emoji: string }[] = [
  { key: "cried", label: "Chorou", emoji: "\uD83D\uDE22" },
  { key: "loved_it", label: "Amou", emoji: "\uD83D\uDE0D" },
  { key: "felt_aroused", label: "Ficou com tes\u00E3o", emoji: "\uD83E\uDD75" },
  { key: "found_heavy", label: "Achou pesado", emoji: "\uD83C\uDFCB\uFE0F" },
  { key: "wants_more_from_author", label: "Quer mais", emoji: "\uD83D\uDCDA" },
];

interface StepSummaryProps {
  data: ReviewData;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
}

export function StepSummary({
  data,
  onSubmit,
  onBack,
  submitting,
}: StepSummaryProps) {
  const activeBools = BOOL_LABELS.filter(
    (b) => data[b.key] === true,
  );

  return (
    <div className="flex flex-col gap-5 py-4">
      <h2 className="text-lg font-semibold text-center">Resumo da review</h2>

      {/* Stars */}
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={`h-6 w-6 ${
              s <= data.star_rating
                ? "fill-amber-400 text-amber-400"
                : "fill-none text-muted-foreground"
            }`}
          />
        ))}
      </div>

      {/* Boolean badges */}
      {activeBools.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {activeBools.map((b) => (
            <span
              key={b.key}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium"
            >
              {b.emoji} {b.label}
            </span>
          ))}
        </div>
      )}

      {/* Sincere review */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Review sincero
        </p>
        <p className="text-sm leading-relaxed line-clamp-4">
          {data.sincere_review}
        </p>
      </div>

      {/* One-liner */}
      {data.funny_oneliner && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            One-liner
          </p>
          <p className="text-sm italic">&ldquo;{data.funny_oneliner}&rdquo;</p>
        </div>
      )}

      {/* Extra thoughts */}
      {data.extra_thoughts && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Extra
          </p>
          <p className="text-sm leading-relaxed line-clamp-3">
            {data.extra_thoughts}
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 min-h-[44px]"
        >
          Voltar
        </Button>
        <Button
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 min-h-[44px]"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Enviar Review"
          )}
        </Button>
      </div>
    </div>
  );
}
