import type { ReactNode } from "react";

/**
 * A moldura das demonstrações.
 *
 * O que está dentro dela é a tela de verdade — os mesmos componentes que a
 * home, a rodada e o chat renderizam — e não uma captura. Isso é deliberado:
 * paleta, tipografia e dark mode mudam de mês em mês, e toda screenshot
 * tirada hoje nasce vencida sem que ninguém se lembre de trocar. Componente
 * real herda tudo de graça.
 *
 * O que a moldura precisa fazer é avisar que aquilo é exemplo, não o clube de
 * quem está lendo — daí a legenda e o fundo recuado.
 */
export function AboutDemo({
  legenda,
  children,
}: {
  legenda: string;
  children: ReactNode;
}) {
  return (
    <figure className="mt-6 rounded-2xl border bg-muted/30 p-4 sm:p-5">
      {/* `inert` e não só `aria-hidden`: a demo tem botões de verdade — votar,
          revelar spoiler, filtrar por capítulo — e um `aria-hidden` sozinho
          deixaria tudo isso focável pelo Tab, oferecendo ações de um clube que
          não existe. `inert` tira do foco, do clique e da árvore de
          acessibilidade de uma vez. */}
      <div inert aria-hidden="true">
        {children}
      </div>
      <figcaption className="type-micro mt-4 text-center">
        {legenda}
      </figcaption>
    </figure>
  );
}

/**
 * A demo fica fora da árvore de acessibilidade; a legenda é o que resta dela
 * para quem não enxerga a tela. É suficiente porque a explicação da seção
 * está em texto logo acima — a demo ilustra, não informa sozinha.
 */
export function AboutSection({
  id,
  titulo,
  children,
}: {
  id: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="type-title font-display text-2xl sm:text-3xl tracking-tight">
        {titulo}
      </h2>
      {children}
    </section>
  );
}
