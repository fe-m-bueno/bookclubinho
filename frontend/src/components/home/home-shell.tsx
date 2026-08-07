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
      <div className="mx-auto flex max-w-2xl items-end justify-between">
        {children}
      </div>
    </header>
  );
}

export function HomeMain({ children }: SlotProps) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6">{children}</main>
  );
}
