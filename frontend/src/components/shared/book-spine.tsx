import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * O tratamento de livro do app, num lugar só.
 *
 * Três telas desenhavam a mesma ideia — perspectiva com `rotateY`, sombra
 * assimétrica e gradiente de lombada na borda esquerda — cada uma com seus
 * números soltos no meio do JSX. A landing, que é a primeira tela de quem
 * chega, desenhava um quarto livro que não era livro nenhum: 32×48px de
 * retângulo arredondado com três fios de 1px. Com o tratamento aqui, ela passa
 * a mostrar a mesma linguagem visual do resto do app em vez de inventar uma
 * segunda.
 *
 * Duas profundidades porque os dois tamanhos de uso pedem coisas diferentes: a
 * miniatura de 60px do card da home some se a rotação for a da estante, e a
 * capa grande da estante fica chapada com a rotação da miniatura.
 */
type Depth = "sm" | "lg";

const DEPTHS: Record<
  Depth,
  { transform: string; boxShadow: string; spine: string; spineTint: string }
> = {
  sm: {
    transform: "perspective(400px) rotateY(-5deg)",
    boxShadow: "-3px 2px 8px rgba(0,0,0,0.2), 1px 2px 6px rgba(0,0,0,0.08)",
    spine: "w-3",
    spineTint: "linear-gradient(to right, rgba(0,0,0,0.25), transparent)",
  },
  lg: {
    transform: "perspective(600px) rotateY(-8deg)",
    boxShadow: "-6px 4px 14px rgba(0,0,0,0.28), 2px 3px 10px rgba(0,0,0,0.12)",
    spine: "w-5",
    spineTint: "linear-gradient(to right, rgba(0,0,0,0.32), transparent)",
  },
};

interface BookSpineProps {
  children?: ReactNode;
  /** Tamanho, raio, borda e fundo ficam com quem usa — só a profundidade é daqui. */
  className?: string;
  depth?: Depth;
  style?: CSSProperties;
  /** O livro é decoração em quase todo uso; quem tem legenda própria marca aqui. */
  "aria-hidden"?: boolean;
}

export function BookSpine({
  children,
  className,
  depth = "sm",
  style,
  "aria-hidden": ariaHidden,
}: BookSpineProps) {
  const { transform, boxShadow, spine, spineTint } = DEPTHS[depth];

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ transform, boxShadow, ...style }}
      aria-hidden={ariaHidden}
    >
      {children}
      <div
        className={cn("pointer-events-none absolute inset-y-0 left-0", spine)}
        style={{ background: spineTint }}
      />
    </div>
  );
}
