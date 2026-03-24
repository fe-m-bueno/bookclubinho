"use client";

import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { useSkeletonState } from "@/hooks/use-skeleton-state";

interface Genre {
  slug: string;
  display_name: string;
  emoji: string;
  description: string;
}

interface GenreSelectorProps {
  selected: string[];
  onChange: (genres: string[]) => void;
  min?: number;
  max?: number;
}

const SKELETON_ITEMS = Array.from({ length: 12 });
const GRID_CLASSES = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3";

async function fetchGenres(): Promise<Genre[]> {
  const res = await fetch("/api/v1/config/genres", { credentials: "include" });
  if (!res.ok) throw new Error("Erro ao carregar gêneros.");
  const data = await res.json();
  return data.genres as Genre[];
}

export function GenreSelector({
  selected,
  onChange,
  min = 1,
  max = 10,
}: GenreSelectorProps) {
  const { data: genres = [], isLoading } = useQuery({
    queryKey: ["genres"],
    queryFn: fetchGenres,
    staleTime: 5 * 60 * 1000, // 5 min — genre list rarely changes
  });
  const shouldReduceMotion = useReducedMotion();
  const { showSkeleton } = useSkeletonState(isLoading);
  const selectedSet = new Set(selected);

  function toggleGenre(slug: string) {
    if (selectedSet.has(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else {
      if (selected.length >= max) return;
      onChange([...selected, slug]);
    }
  }

  if (showSkeleton) {
    return (
      <div className={GRID_CLASSES}>
        {SKELETON_ITEMS.map((_, i) => (
          <div key={i} className="min-h-[72px] rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={GRID_CLASSES}>
        {genres.map((genre) => {
          const isSelected = selectedSet.has(genre.slug);
          return (
            <motion.button
              key={genre.slug}
              type="button"
              onClick={() => toggleGenre(genre.slug)}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
              className={`flex flex-col items-center justify-center min-h-[72px] rounded-xl p-3 transition-colors duration-150 cursor-pointer ${
                isSelected
                  ? "border-2 border-primary bg-primary/10"
                  : "border border-border bg-background hover:opacity-80"
              }`}
              aria-pressed={isSelected}
              title={genre.description}
            >
              <span className="text-2xl" aria-hidden="true">
                {genre.emoji}
              </span>
              <span className="text-sm font-medium mt-1">{genre.display_name}</span>
            </motion.button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground text-center">
        {selected.length} de {max} selecionados
      </p>
    </div>
  );
}
