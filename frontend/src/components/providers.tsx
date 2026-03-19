"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="bookclub-theme"
    >
      <TooltipProvider>
        {children}
      </TooltipProvider>
      <Toaster position="top-center" richColors closeButton />
    </ThemeProvider>
  );
}
