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

/**
 * A base das URLs absolutas do metadata.
 *
 * O cartão de link só existe em URL absoluta, e sem isto o Next monta a do
 * `opengraph-image` sobre `localhost` no build. Em produção a Vercel entrega
 * `VERCEL_URL` sem protocolo; o domínio próprio, quando houver, entra por
 * `NEXT_PUBLIC_SITE_URL`.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Clube do Livro",
  description: "Seu clube de leitura favorito",
  openGraph: {
    siteName: "Bookclubinho",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
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
