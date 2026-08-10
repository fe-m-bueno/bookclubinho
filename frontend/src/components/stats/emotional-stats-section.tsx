"use client";

import { useReducedMotion, motion } from "framer-motion";
import {
  BookOpen,
  Droplet,
  Dumbbell,
  Flame,
  Heart,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmotionalStats } from "@/lib/types/stats";

interface EmotionalStatsSectionProps {
  stats: EmotionalStats;
}

interface StatBar {
  label: string;
  count: number;
  icon: LucideIcon;
}

/**
 * O ícone saiu do fim do rótulo e virou componente na frente dele.
 *
 * Os cinco emoji estavam colados no texto — `"do grupo já chorou 😢"` — e eram
 * puro reforço: a frase já diz o que a barra mede. Como emoji do sistema, não
 * obedeciam token, mudavam de desenho entre plataformas e eram lidos em voz
 * alta pelo leitor de tela depois da frase que eles repetem. Agora são lucide em
 * sage, à esquerda, decorativos.
 */
function buildBars(stats: EmotionalStats): StatBar[] {
  return [
    { label: "do grupo já chorou", count: stats.cried_count, icon: Droplet },
    { label: "amou o livro", count: stats.loved_it_count, icon: Heart },
    { label: "sentiu tesão", count: stats.felt_aroused_count, icon: Flame },
    { label: "achou pesado", count: stats.found_heavy_count, icon: Dumbbell },
    { label: "quer mais do autor", count: stats.wants_more_count, icon: BookOpen },
  ];
}

export function EmotionalStatsSection({ stats }: EmotionalStatsSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  if (stats.total_reviews === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Como o grupo sentiu</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="type-meta text-center py-6">
            Nenhuma review ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  const bars = buildBars(stats);
  const total = stats.total_reviews;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Como o grupo sentiu</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {bars.map((bar, i) => {
          const pct = total > 0 ? Math.round((bar.count / total) * 100) : 0;

          return (
            <motion.div
              key={bar.label}
              initial={false}
              animate={{ opacity: 1 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { delay: i * 0.1, duration: 0.3 }
              }
              className="space-y-1"
            >
              <div className="flex justify-between items-baseline gap-2">
                {/* O texto fica num filho só: com a frase solta no flex, o
                    `gap` entrava também entre a porcentagem e o rótulo. */}
                <p className="type-body inline-flex items-baseline gap-1.5">
                  <bar.icon
                    className="h-3.5 w-3.5 shrink-0 self-center text-primary"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-semibold tabular-nums">{pct}%</span>{" "}
                    {bar.label}
                  </span>
                </p>
                <span className="type-micro flex-none tabular-nums">
                  {bar.count}/{total}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: "0%" }}
                  whileInView={{ width: `${pct}%` }}
                  viewport={{ once: true }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { delay: i * 0.1, duration: 0.6, ease: "easeOut" }
                  }
                />
              </div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
