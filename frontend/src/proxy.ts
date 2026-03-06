import { NextRequest, NextResponse } from "next/server";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const PUBLIC_PREFIXES = ["/auth", "/shelf"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isSkippedRoute(pathname: string): boolean {
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
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

  const token = request.cookies.get("access_token")?.value;

  if (!token) {
    return redirectTo(request, "/auth/login");
  }

  const payload = decodeJwtPayload(token);

  if (!payload) {
    return redirectTo(request, "/auth/login");
  }

  const exp = payload.exp;
  if (typeof exp === "number" && exp * 1000 < Date.now()) {
    return redirectTo(request, "/auth/login");
  }

  const onboardingCompleted = payload.onb === true;
  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  if (!onboardingCompleted && !isOnboarding) {
    return redirectTo(request, "/onboarding");
  }

  if (onboardingCompleted && isOnboarding) {
    return redirectTo(request, "/");
  }

  const response = NextResponse.next();
  const userId = payload.sub as string | undefined;
  if (userId) {
    response.headers.set("x-user-id", userId);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
