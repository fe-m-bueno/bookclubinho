"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BookSpine } from "@/components/shared/book-spine";
import { ThemeToggle } from "@/components/theme-toggle";

const stagger = 0.08;
const fadeDuration = 0.6;

function Ornament({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0 6h48m24 0h48M56 2l4 4-4 4m8-8l-4 4 4 4"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * O ornamento precisa ler como livro.
 *
 * Eram seis retângulos de 32×48px com gradiente sage e três fios de 1px a
 * 20–50% de opacidade. Nesse tamanho e nesse contraste nenhum detalhe
 * sobrevive: o que se via era um retângulo arredondado. Agora são três, a
 * 56×80, com o mesmo tratamento de perspectiva e lombada que o card da home e
 * a estante usam — em 56px o detalhe finalmente aparece, e menos elementos
 * aliviam a colisão em viewport de pouca altura.
 *
 * A rotação de cada livro fica no wrapper e a perspectiva dentro do
 * `BookSpine`: as duas na mesma `transform` se sobrescrevem.
 */
function FloatingBook({
  className,
  tone,
  delay,
  rotate,
}: {
  className?: string;
  /**
   * A opacidade fica aqui, e não no `className` da posição: o elemento de fora
   * anima `opacity` de 0 a 1, e o `style` inline do Framer ganha de qualquer
   * classe utilitária. Os seis livros originais pediam 20–50% e recebiam 100%
   * — o véu que devia manter o ornamento no fundo nunca chegou a existir.
   */
  tone: string;
  delay: number;
  rotate: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : {
            delay: delay + 0.8,
            duration: 1.2,
            ease: "easeOut",
          }
      }
      aria-hidden="true"
    >
      <motion.div
        animate={reduced ? {} : { y: [0, -6, 0] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay,
        }}
        style={{ rotate }}
        className={tone}
      >
        {/* O sage claro do desenho antigo sumia sobre o creme do light: no
            claro o livro é um tom mais fundo. */}
        <BookSpine className="h-20 w-14 rounded-md bg-gradient-to-b from-sage-300 to-sage-400 dark:from-sage-700 dark:to-sage-800 border border-sage-400/50 dark:border-sage-600/40">
          {/* As linhas da capa começam depois da lombada — passando por baixo
              dela, o gradiente as apagava justo onde elas nascem. */}
          <div className="mt-4 ml-5 mr-3 space-y-1.5">
            <div className="h-px bg-sage-600/35 dark:bg-sage-300/25" />
            <div className="h-px w-3/4 bg-sage-600/25 dark:bg-sage-300/20" />
            <div className="h-px w-1/2 bg-sage-600/20 dark:bg-sage-300/15" />
          </div>
        </BookSpine>
      </motion.div>
    </motion.div>
  );
}

export function LandingPage() {
  const reduced = useReducedMotion();

  const item = (i: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 16 },
    animate: { opacity: 1, y: 0 },
    transition: reduced
      ? { duration: 0 }
      : {
        delay: i * stagger,
        duration: fadeDuration,
        ease: [0.25, 0.46, 0.45, 0.94] as const,
      },
  });

  return (
    // `min-h-dvh` e não `h-dvh`: com altura travada e `overflow-hidden`, o que
    // não coubesse simplesmente sumia — em viewport baixa (≲600px) o ornamento
    // de baixo montava em cima da atribuição do rodapé, sem scroll para
    // alcançar nada. Os livros decorativos são `absolute` e ainda precisam de
    // contenção, mas só na horizontal: `overflow-x-clip` segura o vazamento
    // lateral sem travar o vertical. O `py-14` reserva a faixa da atribuição,
    // que é `absolute` e por isso não empurra o conteúdo.
    <div
      className="relative min-h-dvh w-full overflow-x-clip flex flex-col items-center justify-center px-6 py-14 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,oklch(0.94_0.03_78)_0%,oklch(0.96_0.015_78)_60%,oklch(0.93_0.02_152_/_8%)_100%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,oklch(0.20_0.015_76)_0%,oklch(0.17_0.01_75)_60%,oklch(0.22_0.03_152_/_6%)_100%)]"
    >
      {/* Theme toggle */}
      <div className="absolute top-5 right-5 z-10">
        <ThemeToggle />
      </div>

      {/* Três livros, não seis: em 56px cada um pesa o triplo do que pesava em
          32px, e o que era textura vira ornamento. A opacidade é maior no
          dark: sage escuro sobre carvão tem menos contraste do que sage médio
          sobre creme, e é a lombada que se perde primeiro. */}
      <FloatingBook
        className="absolute top-[10%] left-[6%]"
        tone="opacity-60 dark:opacity-70"
        delay={0}
        rotate={-12}
      />
      <FloatingBook
        className="absolute top-[16%] right-[8%]"
        tone="opacity-50 dark:opacity-60"
        delay={0.5}
        rotate={8}
      />
      {/* O terceiro troca de canto em telas estreitas. Em 375px os CTAs são
          faixas da largura inteira, e o "Já tenho conta" é outline — o livro
          atrás dele aparecia através do botão. Embaixo à esquerda, abaixo dos
          CTAs e fora da faixa central da assinatura, ele não cruza nada. */}
      <FloatingBook
        className="absolute bottom-[4%] left-[5%] sm:bottom-[14%] sm:left-auto sm:right-[10%]"
        tone="opacity-50 dark:opacity-60"
        delay={1}
        rotate={12}
      />

      {/* Main content */}
      <div className="relative z-[1] flex flex-col items-center text-center max-w-lg">
        {/* Top ornament */}
        <motion.div {...item(0)}>
          <Ornament className="w-24 sm:w-28 text-brand-400 dark:text-brand-500 mb-6 sm:mb-8" />
        </motion.div>

        {/* Icon */}
        <motion.div {...item(1)} className="mb-4 sm:mb-5">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-sage-100 dark:bg-sage-900/50 border border-sage-200/60 dark:border-sage-700/30 shadow-warm-sm">
            <BookOpen
              className="w-7 h-7 sm:w-8 sm:h-8 text-sage-600 dark:text-sage-400"
              strokeWidth={1.5}
            />
          </div>
        </motion.div>

        {/* Overline */}
        <motion.p
          {...item(2)}
          className="text-[0.7rem] sm:text-xs font-medium tracking-[0.25em] uppercase text-muted-foreground mb-3 sm:mb-4"
        >
          Clube do Livro
        </motion.p>

        {/* Title */}
        <motion.h1
          {...item(3)}
          className="font-display text-[2.5rem] sm:text-5xl md:text-6xl leading-[1.05] tracking-tight text-foreground mb-4 sm:mb-5"
        >
          Leia junto.
          <br />
          <span className="text-primary">Sinta junto.</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          {...item(4)}
          className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xs sm:max-w-md mb-6 sm:mb-8"
        >
          O jeito mais fácil de manter um clube do livro. Porque ler
          sozinho é só metade da história.
        </motion.p>

        {/* Divider */}
        <motion.div
          {...item(5)}
          className="w-full max-w-[200px] mb-6 sm:mb-8"
        >
          <div className="divider-ornament">
            <span></span>
          </div>
        </motion.div>

        {/* CTAs */}
        <motion.div
          {...item(6)}
          className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto"
        >
          <Button
            asChild
            size="lg"
            className="h-12 px-8 text-base rounded-xl shadow-warm-md hover:shadow-warm-lg"
          >
            <Link href="/auth/register">Criar meu clube</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 px-8 text-base rounded-xl"
          >
            <Link href="/auth/login">Já tenho conta</Link>
          </Button>
        </motion.div>

        {/* Bottom ornament */}
        <motion.div {...item(7)} className="mt-8 sm:mt-10">
          <Ornament className="w-24 sm:w-28 text-brand-400 dark:text-brand-500 rotate-180" />
        </motion.div>
      </div>

      {/* A assinatura do rodapé era texto morto — a única coisa na tela que
          parecia clicável e não era. Vira a porta discreta para o /about, que
          é onde a explicação do produto mora; a landing continua sendo uma
          tela só, com dois CTAs. O `bottom-1` com alvo de 44px deixa o texto
          na mesma altura visual de antes. */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduced ? { duration: 0 } : { delay: 1.2, duration: 0.8 }}
        className="absolute bottom-1"
      >
        <Link
          href="/about"
          className="inline-flex min-h-11 items-center rounded-md px-3 text-[0.65rem] tracking-widest uppercase text-muted-foreground/50 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          bookclubinho
        </Link>
      </motion.p>
    </div>
  );
}
