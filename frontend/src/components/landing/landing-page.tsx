"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { BookMark } from "@/components/brand/book-mark";
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
 * O desenho em si saiu daqui para o `BookMark`: virou a marca do app quando os
 * headers de auth trocaram o 📚 por ela. O que sobra neste arquivo é só o
 * movimento.
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
        <BookMark />
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

      {/* Três livros na tela estreita, seis a partir de `lg`.
          A conta é de densidade, não de gosto: eram seis a 32×48 em qualquer
          largura, e em 375px eles se atropelavam. A 56×80 cada um pesa o
          triplo, e três bastam para uma tela de telefone — mas em 1920px o
          mesmo trio se perde num campo de creme vazio. Os três de baixo só
          existem onde há margem lateral para eles: `lg` é a largura em que a
          coluna de conteúdo (`max-w-lg`) para de encostar nas bordas.

          A opacidade é maior no dark: sage escuro sobre carvão tem menos
          contraste do que sage médio sobre creme, e é a lombada que se perde
          primeiro. */}
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

      {/* O reforço de tela larga. Todos entre 3% e 17% das bordas: é a faixa
          que sobra dos dois lados quando a coluna de conteúdo trava em
          `max-w-lg`, e nenhum deles cruza o texto nem os CTAs. */}
      <FloatingBook
        className="absolute top-[52%] left-[15%] hidden lg:block"
        tone="opacity-40 dark:opacity-50"
        delay={0.3}
        rotate={-8}
      />
      <FloatingBook
        className="absolute top-[64%] right-[16%] hidden lg:block"
        tone="opacity-40 dark:opacity-50"
        delay={0.8}
        rotate={10}
      />
      <FloatingBook
        className="absolute bottom-[10%] left-[4%] hidden lg:block"
        tone="opacity-45 dark:opacity-55"
        delay={1.3}
        rotate={-16}
      />

      {/* Main content */}
      <div className="relative z-[1] flex flex-col items-center text-center max-w-lg">
        {/* Top ornament */}
        <motion.div {...item(0)}>
          <Ornament className="w-24 sm:w-28 text-brand-400 dark:text-brand-500 mb-6 sm:mb-8" />
        </motion.div>

        {/* A marca, e não um ícone genérico dentro de um quadrado. O ícone de
            livro no topo era o mesmo lucide que a UI funcional usa a 16px —
            aqui ele só ocupava o lugar em que o nome do produto deveria estar.
            O "Clube do Livro" em caixa alta saiu junto: dizia em rótulo o que
            o nome já diz, e o título logo abaixo repete de novo. */}
        <motion.p
          {...item(1)}
          className="font-display text-3xl sm:text-4xl tracking-tight text-foreground/90 mb-5 sm:mb-6"
        >
          Bookclubinho
        </motion.p>

        {/* Title */}
        <motion.h1
          {...item(2)}
          className="font-display text-[2.5rem] sm:text-5xl md:text-6xl leading-[1.05] tracking-tight text-foreground mb-4 sm:mb-5"
        >
          Leia junto.
          <br />
          <span className="text-primary">Sinta junto.</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          {...item(3)}
          className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xs sm:max-w-md mb-6 sm:mb-8"
        >
          O jeito mais fácil de manter um clube do livro. Porque ler
          sozinho é só metade da história.
        </motion.p>

        {/* Divider */}
        <motion.div
          {...item(4)}
          className="w-full max-w-[200px] mb-6 sm:mb-8"
        >
          <div className="divider-ornament">
            <span></span>
          </div>
        </motion.div>

        {/* CTAs */}
        <motion.div
          {...item(5)}
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
        <motion.div {...item(6)} className="mt-8 sm:mt-10">
          <Ornament className="w-24 sm:w-28 text-brand-400 dark:text-brand-500 rotate-180" />
        </motion.div>
      </div>

      {/* O rodapé era a assinatura "bookclubinho" — texto morto, e agora
          também repetido: o nome subiu para o topo em Fraunces. No lugar dela
          fica a única coisa que o rodapé precisa fazer, que é abrir a
          explicação do produto para quem chegou por convite e não faz ideia do
          que é isto. O `bottom-1` com alvo de 44px mantém o texto na mesma
          altura visual da assinatura antiga. */}
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
          o que é isso?
        </Link>
      </motion.p>
    </div>
  );
}
