/**
 * CSRF double-submit cookie helper.
 *
 * The backend sets a non-httpOnly `csrf_token` cookie on every GET response.
 * Mutating requests (POST/PUT/PATCH/DELETE) must echo the value back via
 * the `X-CSRF-Token` header.
 */

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "X-CSRF-Token";

function getCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match?.split("=")[1];
}

/**
 * Merge CSRF header into an existing headers object.
 * Returns a new object — does not mutate the input.
 */
export function withCsrf(
  headers: Record<string, string> = {},
): Record<string, string> {
  const token = getCsrfToken();
  if (!token) return headers;
  return { ...headers, [CSRF_HEADER]: token };
}
