"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="bookclub-theme"
    >
      {children}
      <Toaster position="top-center" richColors closeButton />
    </ThemeProvider>
  );
}
