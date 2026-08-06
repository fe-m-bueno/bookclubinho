import type { Metadata } from "next";
import { Fraunces, Rubik, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clube do Livro",
  description: "Seu clube de leitura favorito",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("bookclub-theme");
  const theme = themeCookie?.value ?? "system";

  return (
    // `data-scroll-behavior` diz ao Next que o `scroll-behavior: smooth` do
    // `globals.css` é intencional. Sem isso ele avisa em dev, e por um motivo:
    // ao trocar de rota o scroll para o topo herda a animação, então a página
    // nova entra deslizando de onde a antiga estava. Com o atributo, o Next usa
    // scroll instantâneo na navegação e mantém o suave nos âncoras da página.
    <html
      lang="pt-BR"
      className={theme !== "system" ? theme : undefined}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body
        className={`${fraunces.variable} ${rubik.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
