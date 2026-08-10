import { cn } from "@/lib/utils";

import { BookSpine } from "@/components/shared/book-spine";

/**
 * A marca do app: o livro.
 *
 * Não é ícone novo. É o desenho que a landing já mostrava no `FloatingBook` e
 * que o `icon.svg` traduziu para SVG no #321 — mesma proporção 56×80, mesmo
 * gradiente sage, mesma lombada, mesmos três fios a partir dela. Aqui ele vira
 * componente porque passou a ter mais de um consumidor: a landing anima três
 * cópias no fundo, e os headers de auth precisam de uma parada.
 *
 * O que ele substitui é o 📚: login e registro abriam com um emoji do sistema,
 * de quatro linguagens visuais que competiam em quatro telas seguidas do
 * cadastro. Trocar por um ícone de biblioteca do lucide consertaria o token e
 * manteria a troca de linguagem — quem vem da landing acabou de ver *este*
 * livro, e é ele que o favicon e o cartão do link também mostram.
 *
 * Sem animação: quem quiser movimento envolve por fora, como a landing faz.
 */
type MarkSize = "sm" | "lg";

const SIZES: Record<MarkSize, { frame: string; lines: string; gap: string }> = {
  // O tamanho de header: o emoji que ele substitui media 36px de caixa.
  sm: { frame: "h-14 w-10 rounded", lines: "mt-3 ml-3.5 mr-2", gap: "space-y-1" },
  // O tamanho do ornamento e do favicon, onde a lombada tem espaço para ler.
  lg: { frame: "h-20 w-14 rounded-md", lines: "mt-4 ml-5 mr-3", gap: "space-y-1.5" },
};

interface BookMarkProps {
  size?: MarkSize;
  /** Só posição e opacidade — medida e cor são da marca. */
  className?: string;
}

export function BookMark({ size = "lg", className }: BookMarkProps) {
  const { frame, lines, gap } = SIZES[size];

  return (
    <BookSpine
      aria-hidden
      className={cn(
        frame,
        // O sage claro sumia sobre o creme do light: no claro o livro é um tom
        // mais fundo.
        "bg-gradient-to-b from-sage-300 to-sage-400 dark:from-sage-700 dark:to-sage-800",
        "border border-sage-400/50 dark:border-sage-600/40",
        className,
      )}
    >
      {/* As linhas da capa começam depois da lombada — passando por baixo dela,
          o gradiente as apagava justo onde elas nascem. */}
      <div className={cn(lines, gap)}>
        <div className="h-px bg-sage-600/35 dark:bg-sage-300/25" />
        <div className="h-px w-3/4 bg-sage-600/25 dark:bg-sage-300/20" />
        <div className="h-px w-1/2 bg-sage-600/20 dark:bg-sage-300/15" />
      </div>
    </BookSpine>
  );
}
