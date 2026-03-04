import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-5xl">
          📚
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Clube do Livro
          </h1>
          <p className="text-lg text-muted-foreground">em breve</p>
        </div>

        <p className="max-w-sm text-sm text-muted-foreground">
          Um espaço para ler junto, votar nos próximos livros e compartilhar o
          amor pela leitura.
        </p>
      </div>
    </main>
  );
}
