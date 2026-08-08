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
 * Largura da página. `max-w-2xl` até o breakpoint de desktop e `max-w-6xl` a
 * partir dele: em 1280px o conteúdo ocupava 672px e deixava metade da tela
 * vazia dos dois lados, mas abrir antes do trilho existir só esticaria o card.
 */
const PAGE_WIDTH = "mx-auto w-full max-w-2xl lg:max-w-6xl";

export function HomeShell({ children }: SlotProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background pb-24">
      {children}
    </div>
  );
}

export function HomeHeader({ children }: SlotProps) {
  return (
    <header className="px-6 pt-10 pb-8">
      <div className={`${PAGE_WIDTH} flex items-end justify-between`}>
        {children}
      </div>
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
    // A coluna de ação não estica: fica nos mesmos 672px em que os cards foram
    // desenhados, e o par centraliza. Com `1fr` o card ia a ~900px em 1280 e o
    // rodapé dele — contagem de membros e avatares — ficava boiando longe de
    // tudo. O espaço que sobra é margem, não conteúdo esticado.
    <div className="lg:grid lg:grid-cols-[minmax(0,42rem)_320px] lg:items-start lg:justify-center lg:gap-8">
      <div className="min-w-0">{children}</div>
      {rail && (
        // `sticky` só no desktop: no rodapé de uma coluna única ele não teria
        // o que grudar, e a barra de URL do mobile briga com `top`.
        <aside className="mt-10 lg:mt-0 lg:sticky lg:top-10">{rail}</aside>
      )}
    </div>
  );
}
