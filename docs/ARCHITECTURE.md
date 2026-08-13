# ARCHITECTURE — Bookclubinho

An overview of the system architecture, security layers, and design decisions.

---

## Production Stack

```
                    ┌─────────────────────┐
  User ────────────▶│  Vercel (Next.js)   │
                    │  App Router + RSC   │
                    └──────────┬──────────┘
                               │ /api/v1/* (rewrite)
                    ┌──────────▼──────────┐
                    │   Render (FastAPI)   │
                    │  Python 3.12        │
                    └────┬──────┬────┬────┘
                         │      │    │
               ┌─────────▼──┐   │  ┌▼──────────────┐
               │ PostgreSQL  │   │  │  Upstash Redis  │
               │  (Render)   │   │  │  (cache + SSE)  │
               └─────────────┘   │  └────────────────┘
                                 │
                    ┌────────────▼──────────────┐
                    │    Cloudflare R2 (Storage) │
                    │    avatars/ + groups/ pub  │
                    │    media/ + exports/ priv  │
                    └───────────────────────────┘

                    ┌─────────────────────┐
                    │  Render Worker      │
                    │  notifications      │
                    └─────────────────────┘
```

External services: **Resend** (transactional email), **Hardcover** (GraphQL books API), **Sentry** (errors + performance).

---

## Security Layers

### Frontend (Next.js / Vercel)

| Control | Implementation |
|---|---|
| Content Security Policy | `next.config.ts` — Report-Only during validation |
| Security headers | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| Sentry PII scrubbing | `sentry.client.config.ts` — strips email, token params, form inputs |
| ESLint no-danger | `eslint.config.mjs` — blocks `dangerouslySetInnerHTML` |
| No secrets in the bundle | Only `NEXT_PUBLIC_*` is exposed to the client |

### Backend (FastAPI / Render)

Middleware chain (execution order — LIFO in Starlette):

```
Request → SecurityHeaders → CORS → CSRF → BodySizeLimit → RLS → Route Handler
```

| Control | Implementation |
|---|---|
| Security headers | `app/security/headers.py` — HSTS in prod, no X-XSS-Protection |
| CORS | `main.py` — explicit origins, no wildcard |
| CSRF | `app/security/csrf.py` — double-submit cookie + HMAC |
| Body size limit | `app/security/body_limit.py` — 1MB by default, 16MB on uploads |
| Row Level Security | Every table has RLS enabled with policies keyed on `app.current_user_id`. **Not enforced today** — the app connects as a superuser, which bypasses RLS. See below. |
| Rate limiting | `slowapi` + Upstash Redis — per IP and per endpoint |
| Brute force | `app/services/auth.py` — Redis counter, lockout after 10 failures, progressive delay |
| Flood protection | `app/services/chat.py` — max 10 msgs/min/user/group + 30s dedup |
| Input sanitization | `bleach.clean()` on every text input |
| Tiptap sanitization | `app/security/tiptap.py` — node/mark allowlist, blocks javascript: URIs |
| File upload security | Magic bytes + Pillow re-encode to WebP + EXIF strip |
| Structured logging + PII | `structlog` with `_pii_filter_processor` — masks emails, redacts tokens |
| Sentry PII scrubbing | `main.py` `_sentry_before_send` — strips cookies, auth header, email |
| SQL injection | SQLAlchemy ORM only; `text()` only with explicit UUID validation |
| JWT | HS256 + Redis blacklist + session tracking + rotation |
| Cookies | httpOnly, secure, sameSite=lax, explicit max_age |
| Timing attacks | `hmac.compare_digest()` for tokens, bcrypt for passwords |
| Email enumeration | Every auth response returns an identical message |
| Audit log | `app/services/audit.py` — immutable, fire-and-forget, RLS read-own |

### RLS: written, correct, and not yet enforced

The app connects with a superuser role, and a superuser **does not evaluate
policies** — not even with `FORCE ROW LEVEL SECURITY`. So the schema's 86
policies block nothing today: the application is the only guard.

This is neither aspirational nor broken — it is a pending configuration step.
Migrations 0025–0027 fixed the five defects that prevented the switch, and the
full flow was verified with the app running as a role without `BYPASSRLS` and
without ownership of the tables. What remains is pointing the web service's
`DATABASE_URL` at that role, keeping the privileged one for migrations.
Procedure, verification, and rollback are in `docs/RUNBOOK.md`.

**When writing an endpoint, scope the query in the application.** Do not assume
the database filters by user, because right now it doesn't. `membership.resolve`
and the `GroupMemberDep`/`GroupAdminDep` dependencies are what actually protect
you.

---

## Storage Access Model (R2)

```
Bucket: bookclubinho
├── avatars/           ← PUBLIC (CDN via S3_PUBLIC_URL)
├── groups/            ← PUBLIC (CDN via S3_PUBLIC_URL)
├── media/             ← PRIVATE (presigned GET, 1h expiry)
└── exports/           ← PRIVATE (presigned GET, 1h expiry)
```

**Bucket policy:** allows `s3:GetObject` only on `avatars/*` and `groups/*`.

`get_public_url(path)` detects the prefix automatically and returns either a public or a presigned URL.

**A private-prefix URL is presentation, not data.** What gets persisted is the
object key — `group_messages.media_key` stores `media/{group_id}/{uuid}.webp`,
and the URL is resolved on every serialization. Storing the presigned URL made
chat images break an hour later. The client returns the upload's key in the
message POST, and the backend validates that it belongs to the group.

---

## Auth Flow

```
┌─────────┐     POST /auth/login      ┌─────────────┐
│ Browser │ ────────────────────────▶ │  FastAPI    │
│         │                           │             │
│         │ ◀── httpOnly cookies ──── │  Sets:      │
│         │   access_token (15min)    │  access_token│
│         │   refresh_token (7d)      │  refresh_token│
└─────────┘                           └─────────────┘

Automatic refresh: POST /auth/refresh with the refresh cookie
Logout: DELETE /auth/logout — blacklists the JWT in Redis + clears cookies

Google OAuth:
  1. GET /auth/google → redirect to Google
  2. GET /auth/google/callback → exchange code for tokens → set cookies

Magic Link:
  1. POST /auth/magic-link → generate a signed token → email via Resend
  2. GET /auth/magic-link/verify?token=... → validate → set cookies
```

### Personal access tokens (non-browser clients)

An httpOnly cookie plus CSRF is the right answer for the browser, and only for
it: both pieces exist because the browser attaches the cookie on its own. A CLI
or an agent does not have that problem, so they use
`Authorization: Bearer <token>`.

```
POST   /api/v1/auth/tokens       create — returns the secret exactly once
GET    /api/v1/auth/tokens       list (prefix only, never the secret)
DELETE /api/v1/auth/tokens/{id}  revoke

curl -H "Authorization: Bearer bcp_xxx" $API/users/me
```

Four decisions that matter more than the code:

- **Only the hash goes to the database** (SHA-256, not bcrypt — the token is 256
  bits we drew ourselves, so there is nothing to guess; see `core/security.py`).
- **Managing tokens requires a browser session.** A PAT can neither create nor
  revoke PATs; otherwise a leaked token would become permanent and lock the
  owner out — `deps.SessionOnlyUser`.
- **CSRF is waived only when no session cookie is present.** With a cookie
  present, validation still applies; otherwise a made-up `Authorization` header
  would disable CSRF on a cookie-authenticated request.
- **The cookie beats the Bearer** when both arrive on the same request.

This path's RLS context is applied in the dependency, not in `RLSMiddleware`:
the middleware runs before a database session exists, and resolving an opaque
token requires a SELECT. See `deps._resolve_bearer_user_id` and the comment on
migration 0024.

---

## Data Model — Main Relationships

```
User
 ├── UserSession (1:N) — active sessions with device tracking
 ├── GroupMember (1:N) — group memberships
 ├── ReadingProgress (1:N) — immutable snapshots
 ├── UserBadge (1:N) — achievements
 └── AuditLog (1:N) — security events

Group
 ├── GroupMember (1:N)
 ├── Round (1:N)
 │    ├── RoundNomination (1:N)
 │    ├── RoundVote (1:N)
 │    └── BookReview (1:N)
 ├── GroupMessage (1:N)
 │    ├── MessageReaction (1:N)
 │    └── MessageReport (1:N)
 └── Meeting (1:N)
```

---

## SSE (Server-Sent Events)

Realtime via Redis Streams (Upstash TCP):

```
Producer: the backend writes events to bookclub:group:{group_id}
Consumer: GET /api/v1/groups/{id}/stream — XREAD BLOCK 0
Frontend: EventSource → updates the UI via React Query invalidation
```

It does not use WebSockets — SSE is enough for this use case (unidirectional server→client).

---

## CI/CD

```
Push/PR → GitHub Actions
  ├── secrets-scan (gitleaks)
  ├── backend-lint (ruff)
  ├── backend-test (pytest + postgres + redis services)
  ├── backend-audit (pip-audit)
  ├── frontend-lint (eslint + tsc)
  └── frontend-audit (npm audit --audit-level=high)

Automatic deploy:
  ├── Backend + worker + Postgres → Render Blueprint
  └── Frontend → Vercel (push to master)
```
