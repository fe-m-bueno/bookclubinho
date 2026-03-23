"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuthSubmit } from "@/hooks/use-auth-submit";
const MAX_GENRES = 10;
const SKELETON_ITEMS = Array.from({ length: 12 });
const GRID_CLASSES = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3";

interface Genre {
  slug: string;
  display_name: string;
  emoji: string;
  description: string;
}

interface StepGenresFormProps {
  onNext: () => void;
  onBack: () => void;
}

export function StepGenresForm({ onNext, onBack }: StepGenresFormProps) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const shouldReduceMotion = useReducedMotion();

  const { submit, loading: submitting } = useAuthSubmit({
    url: "/api/v1/onboarding/preferences",
    onSuccess: () => onNext(),
    statusHandlers: [
      {
        status: 422,
        handler: async (res) => {
          const body = await res.json();
          const detail = body.detail;
          const msg =
            typeof detail === "string"
              ? detail
              : Array.isArray(detail)
                ? detail.map((e: { msg?: string }) => e.msg).join(", ")
                : "Erro de validação";
          toast.error(msg);
        },
      },
    ],
  });

  useEffect(() => {
    const controller = new AbortController();

    async function fetchGenres() {
      try {
        const res = await fetch("/api/v1/config/genres", {
          credentials: "include",
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setGenres(data.genres);
        } else {
          toast.error("Erro ao carregar gêneros.");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          toast.error("Erro de conexão. Verifique sua internet.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    fetchGenres();

    return () => controller.abort();
  }, []);

  function toggleGenre(slug: string) {
    setSelectedGenres((prev) => {
      if (prev.has(slug)) {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      }
      if (prev.size >= MAX_GENRES) return prev;
      return new Set(prev).add(slug);
    });
  }

  function handleSubmit() {
    submit(JSON.stringify({ preferred_genres: [...selectedGenres] }));
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-display font-semibold">Escolha seus gêneros favoritos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Selecione de 1 a 10 gêneros que você mais curte.
        </p>
      </div>

      {loading ? (
        <div className={GRID_CLASSES}>
          {SKELETON_ITEMS.map((_, i) => (
            <div key={i} className="min-h-[72px] rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className={GRID_CLASSES}>
          {genres.map((genre) => {
            const isSelected = selectedGenres.has(genre.slug);
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
      )}

      <p className="text-sm text-muted-foreground text-center">
        {selectedGenres.size} de {MAX_GENRES} selecionados
      </p>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 h-11" onClick={onBack}>
          Voltar
        </Button>
        <Button
          className="flex-1 h-11"
          disabled={selectedGenres.size < 1 || submitting}
          onClick={handleSubmit}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Próximo"
          )}
        </Button>
      </div>
    </div>
  );
}
