"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UnauthorizedError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // O QueryClient vive dentro do componente (padrão do App Router) por dois
  // motivos: não compartilhar cache entre requisições no servidor, e ter acesso
  // ao router — que é o que permite o redirect do 401 acontecer aqui.
  //
  // Antes, `apiFetch` recebia um router e navegava sozinho. Cada caller
  // precisava carregar um, e o `if (res.status === 401) router.push(...)`
  // estava repetido em doze hooks.
  const [queryClient] = useState(() => {
    const onUnauthorized = (error: unknown) => {
      if (error instanceof UnauthorizedError) router.push("/auth/login");
    };
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          // Sessão expirada não melhora com retry.
          retry: (count, error) =>
            !(error instanceof UnauthorizedError) && count < 1,
          refetchOnWindowFocus: false,
        },
      },
      queryCache: new QueryCache({ onError: onUnauthorized }),
      mutationCache: new MutationCache({ onError: onUnauthorized }),
    });
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        storageKey="bookclub-theme"
      >
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
