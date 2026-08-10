import { NextRequest, NextResponse } from "next/server";

/**
 * O que o proxy precisa saber sobre a sessão.
 *
 * Não é o payload inteiro do JWT — é só o recorte que decide para onde a
 * requisição vai. Os três campos são obrigatórios aqui de propósito: um token
 * sem `exp` numérico não tem como ser considerado válido, e um `sub` que não é
 * string não pode virar header.
 */
interface SessionClaims {
  sub: string;
  exp: number;
  onb: boolean;
}

/**
 * O `sub` vira o header `x-user-id`, então precisa ser seguro como valor de
 * header: sem CR, sem LF, sem espaço. Um `\r\n` num valor de header derruba a
 * requisição no `headers.set` — 500 em vez de redirect — e onde não derruba é
 * response splitting. UUID e os ids dos testes passam; qualquer coisa exótica
 * não.
 */
const USER_ID_RE = /^[\w-]{1,128}$/;

/**
 * Decodifica o payload do JWT **sem verificar a assinatura**.
 *
 * A assinatura é conferida no backend a cada request; aqui a leitura serve só
 * para rotear. Por isso cada campo é validado em runtime em vez de assumido: o
 * conteúdo é literalmente um cookie que o cliente controla, e `JSON.parse`
 * devolve `unknown` de verdade — `"123"`, `null` e `[1,2]` são JSON válido e
 * nenhum deles é um payload.
 */
function decodeJwtPayload(token: string): SessionClaims | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const parsed: unknown = JSON.parse(atob(padded));

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    if (!("sub" in parsed) || typeof parsed.sub !== "string") return null;
    if (!USER_ID_RE.test(parsed.sub)) return null;
    if (!("exp" in parsed) || typeof parsed.exp !== "number") return null;

    // `onb` ausente conta como onboarding pendente — o gate erra para o lado de
    // mandar ao onboarding, não para o de liberar o app.
    return {
      sub: parsed.sub,
      exp: parsed.exp,
      onb: "onb" in parsed && parsed.onb === true,
    };
  } catch {
    return null;
  }
}

// A /about entra aqui pelo mesmo motivo que a /shelf: ela existe para ser
// aberta por quem ainda não tem conta. Mandá-la para o login seria pedir
// cadastro para responder "o que é isso?".
const PUBLIC_PREFIXES = ["/auth", "/shelf", "/about"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Os arquivos que o Next gera a partir das convenções de metadata.
 *
 * Eles são pedidos por quem nunca terá cookie: o crawler que monta o cartão do
 * link, o browser que busca o ícone da aba. Mandá-los para o login devolve um
 * 307 no lugar da imagem, e o cartão sai quebrado em toda parte onde o link
 * for colado. Os que terminam em extensão já caem na regra de arquivo
 * estático; estes não têm ponto nenhum no caminho.
 */
const METADATA_ROUTES = [
  "/opengraph-image",
  "/twitter-image",
  "/icon",
  "/apple-icon",
  "/manifest.webmanifest",
];

function isSkippedRoute(pathname: string): boolean {
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
    return true;
  }
  if (
    METADATA_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}-`),
    )
  ) {
    return true;
  }
  if (pathname.includes(".")) {
    const ext = pathname.split(".").pop();
    if (
      ext &&
      ["ico", "png", "jpg", "jpeg", "svg", "webp", "css", "js", "woff", "woff2", "ttf"].includes(ext)
    ) {
      return true;
    }
  }
  return false;
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isSkippedRoute(pathname) || isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // "/" serve a landing page para quem não tem sessão, mas para quem tem ela é
  // a home — e precisa passar pelo gate de onboarding como qualquer outra rota
  // privada. Sem sessão válida, cai na landing em vez de ir para o login.
  const isRoot = pathname === "/";
  const noSession = () =>
    isRoot ? NextResponse.next() : redirectTo(request, "/auth/login");

  const token = request.cookies.get("access_token")?.value;

  if (!token) {
    return noSession();
  }

  const claims = decodeJwtPayload(token);

  if (!claims) {
    return noSession();
  }

  if (claims.exp * 1000 < Date.now()) {
    return noSession();
  }

  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  if (!claims.onb && !isOnboarding) {
    return redirectTo(request, "/onboarding");
  }

  if (claims.onb && isOnboarding) {
    return redirectTo(request, "/");
  }

  const response = NextResponse.next();
  response.headers.set("x-user-id", claims.sub);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
