import type { Metadata } from "next";
import Link from "next/link";

import { AboutDemo, AboutSection } from "@/components/about/about-demo";
import { ChatDemo } from "@/components/about/chat-demo";
import { ClubeDemo, VotacaoDemo } from "@/components/about/round-demo";
import { ENCONTRO, LEITOR } from "@/components/about/about-fixtures";
import { HomeStateRail } from "@/components/home/home-state-rail";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "O que é o Bookclubinho",
  description:
    "Como funciona uma rodada, o chat com spoiler e o que o app registra da sua leitura.",
};

/**
 * A página que responde "o que é isso?".
 *
 * Ela existe porque quem chega no app não passa pela landing: o convite cai em
 * `/groups/join?code=`, e um link de estante compartilhada cai em
 * `/shelf/[id]` — as duas telas renderizam deslogadas, e nas duas a pessoa vê
 * uma tela do produto sem nunca ter visto o produto.
 *
 * Por isso o texto é escrito para quem já tem um pé dentro, e não para um
 * estranho vindo de busca. Não é funil nem manifesto: são as três perguntas
 * que essa pessoa tem, na ordem em que ela as faz.
 *
 * Pública e sem cookie — nada aqui depende de sessão, então a rota é estática.
 */
export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 py-4">
          <Link
            href="/"
            className="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 font-display text-lg tracking-tight transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Bookclubinho
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <h1 className="font-display text-3xl sm:text-4xl leading-tight tracking-tight">
          Um clube do livro que não morre no terceiro mês.
        </h1>
        <p className="type-body mt-4 text-muted-foreground">
          Você provavelmente chegou aqui por um convite ou por um link de
          estante. O Bookclubinho é onde um grupo de até oito pessoas escolhe o
          próximo livro, lê no mesmo ritmo e conversa sobre ele sem estragar a
          leitura de ninguém. Abaixo está o que o app faz, na ordem em que
          acontece.
        </p>

        <div className="mt-12 space-y-14">
          <AboutSection id="rodada" titulo="A rodada">
            <p className="type-body mt-3 text-muted-foreground">
              Ler junto começa por combinar o quê. Cada rodada tem quatro
              fases: todo mundo <strong className="font-medium text-foreground">indica</strong>{" "}
              até três livros, o grupo <strong className="font-medium text-foreground">vota</strong>{" "}
              (um voto por pessoa, revelado só no fim),{" "}
              <strong className="font-medium text-foreground">lê</strong> com um
              prazo combinado e, quando fecha,{" "}
              <strong className="font-medium text-foreground">avalia</strong>.
              Terminada uma, começa a próxima.
            </p>
            <AboutDemo legenda="A votação: cada indicação com quem indicou e o porquê. Os votos só aparecem quando a fase fecha.">
              <VotacaoDemo />
            </AboutDemo>
            <AboutDemo legenda="Durante a leitura, o clube na sua tela inicial: o livro da vez, o seu progresso e a última conversa.">
              <ClubeDemo />
            </AboutDemo>
          </AboutSection>

          <AboutSection id="chat" titulo="O chat, e o borrão">
            <p className="type-body mt-3 text-muted-foreground">
              Cada clube tem uma conversa contínua. Não é um fórum com
              tópicos, é um chat. Duas coisas nele não se adivinham de fora. A primeira:
              quem está mais adiantado marca de qual capítulo está falando, e a
              mensagem chega <strong className="font-medium text-foreground">borrada</strong>{" "}
              para quem ainda não chegou lá. Ela se revela sozinha quando você
              passa daquele ponto, ou na hora, se você tocar e confirmar. A
              segunda: o <strong className="font-medium text-foreground">marcador de capítulo</strong>{" "}
              avisa o grupo onde você está e serve de filtro: dá para ler só o
              que foi dito até onde você leu.
            </p>
            <AboutDemo legenda="Uma conversa com marcador de capítulo e uma mensagem que o app segura até você chegar lá.">
              <ChatDemo />
            </AboutDemo>
          </AboutSection>

          <AboutSection id="progresso" titulo="O que o app registra">
            <p className="type-body mt-3 text-muted-foreground">
              Você atualiza em que página está, e é só isso que o app pede. Com
              esse número ele monta a barra de progresso do clube, calcula o
              prazo que sobra e conta a{" "}
              <strong className="font-medium text-foreground">sequência</strong>:
              quantos dias seguidos você leu alguma coisa. A sequência vira
              recorde, o tempo de leitura vira total. Nada disso é público fora
              do seu clube, e nenhum número aqui cobra nada de ninguém. É o
              que o grupo usa para saber se dá para conversar sobre o capítulo
              12.
            </p>
            <AboutDemo legenda="A coluna de estado da tela inicial: sequência, recorde, tempo lendo e o próximo encontro.">
              <HomeStateRail user={LEITOR} meetings={[ENCONTRO]} badges={[]} />
            </AboutDemo>
          </AboutSection>
        </div>

        <div className="mt-16 rounded-2xl border bg-card p-6 text-center shadow-warm-sm">
          <p className="font-display text-xl tracking-tight">
            É isso. O resto é ler.
          </p>
          <p className="type-meta mt-2">
            Se você chegou por um convite, é só voltar para ele e entrar. O
            clube já existe.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-xl px-8">
              <Link href="/auth/register">Criar meu clube</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-xl px-8"
            >
              <Link href="/auth/login">Já tenho conta</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
