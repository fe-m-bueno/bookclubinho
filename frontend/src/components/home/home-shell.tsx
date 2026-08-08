/**
 * Container da home, compartilhado entre o skeleton e o conteúdo.
 *
 * Existe como componente, e não como par de classNames repetidas, porque o
 * skeleton e o conteúdo divergiram exatamente assim: o skeleton ficou sem
 * `min-h-screen` (a página encolhia ao carregar) e sem `pb-24` (o FAB cobria o
 * último card). Enquanto os dois montarem o mesmo componente, não há o que
 * dessincronizar.
 */

interface SlotProps {
  children: React.ReactNode;
}

/**
 * Largura da página. `max-w-2xl` até o breakpoint de desktop e, a partir dele,
 * exatamente a soma das colunas de `HomeColumns` — 46rem + 19rem + o `gap-8`
 * entre elas.
 *
 * A soma é o ponto. Com `max-w-6xl` (72rem) o header media 72rem enquanto o
 * grid media 64rem e ainda centralizava: sobravam 4rem de cada lado, e o
 * cumprimento ficava 64px à esquerda da borda dos cards enquanto o menu ficava
 * 64px à direita do trilho. Nada alinhava com nada, e a página lia como frouxa
 * sem que houvesse um espaço vazio nomeável. Enquanto as duas medidas saírem
 * daqui, header e conteúdo compartilham as mesmas bordas.
 *
 * As medidas aparecem literais aqui e em `HomeColumns` — não como constantes
 * interpoladas — porque o JIT do Tailwind só enxerga classe escrita por
 * extenso. Mexeu numa, confira a outra: 46 + 19 + 2 = 67.
 */
const PAGE_WIDTH = "mx-auto w-full max-w-2xl lg:max-w-[67rem]";

export function HomeShell({ children }: SlotProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background pb-24">
      {children}
    </div>
  );
}

/**
 * O `px-6` fica no mesmo elemento que o `PAGE_WIDTH`, como no `HomeMain`.
 *
 * Aqui ele ficava um nível acima: o header centralizava 67rem dentro de uma
 * caixa já encolhida pelo padding, e o main centralizava 67rem na tela inteira
 * e só então recuava o conteúdo. Dava exatos 24px de diferença — o cumprimento
 * começava à esquerda da borda dos cards e o menu terminava à direita do
 * trilho, o suficiente para a página parecer torta sem que se visse por quê.
 */
export function HomeHeader({ children }: SlotProps) {
  return (
    <header className={`${PAGE_WIDTH} px-6 pt-10 pb-8`}>
      <div className="flex items-end justify-between">{children}</div>
    </header>
  );
}

export function HomeMain({ children }: SlotProps) {
  return <main className={`${PAGE_WIDTH} flex-1 px-6`}>{children}</main>;
}

interface ColumnsProps extends SlotProps {
  rail?: React.ReactNode;
}

/**
 * Centro é ação, trilho é estado.
 *
 * Em uma coluna só, estado e ação empurram um ao outro para fora da dobra — as
 * conquistas faziam isso com os cards de clube. Separá-los é o padrão de
 * Duolingo, Strava, Letterboxd e GitHub: estado se consulta de relance, ação é
 * o que a pessoa veio fazer.
 *
 * Abaixo de `lg:` não há grid nenhum: o trilho volta a ser o rodapé da coluna
 * única, na mesma ordem de leitura, sem `order-*` invertendo DOM e tela.
 */
export function HomeColumns({ children, rail }: ColumnsProps) {
  return (
    // A coluna de ação não estica até a tela toda — com `1fr` o card ia a
    // ~900px em 1280 e o rodapé dele ficava boiando longe de tudo — mas também
    // não fica nos 42rem originais: em 46rem o rodapé do card cabe em uma linha
    // só, com prazo, conversa e ação lado a lado.
    //
    // Sem `justify-center`: as duas colunas somam exatamente o `PAGE_WIDTH`, e
    // é isso que faz o header alinhar com elas. Centralizar aqui reintroduziria
    // a folga que o alinhamento existe para eliminar.
    <div className="lg:grid lg:grid-cols-[minmax(0,46rem)_19rem] lg:items-start lg:gap-8">
      <div className="min-w-0">{children}</div>
      {rail && (
        // `sticky` só no desktop: no rodapé de uma coluna única ele não teria
        // o que grudar, e a barra de URL do mobile briga com `top`.
        <aside className="mt-10 lg:mt-0 lg:sticky lg:top-10">{rail}</aside>
      )}
    </div>
  );
}
