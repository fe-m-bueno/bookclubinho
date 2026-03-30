# ARCHITECTURE — Bookclubinho

Visão geral da arquitetura do sistema, camadas de segurança e decisões de design.

---

## Stack de Produção

```
                    ┌─────────────────────┐
  Usuário ─────────▶│  Vercel (Next.js)   │
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

Serviços externos: **Resend** (email transacional), **Hardcover** (API de livros GraphQL), **Sentry** (erros + performance).

---

## Camadas de Segurança

### Frontend (Next.js / Vercel)

| Controle | Implementação |
|---|---|
| Content Security Policy | `next.config.ts` — Report-Only durante validação |
| Security Headers | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| Sentry PII scrubbing | `sentry.client.config.ts` — strip email, token params, form inputs |
| ESLint no-danger | `eslint.config.mjs` — bloqueia `dangerouslySetInnerHTML` |
| Sem secrets no bundle | Apenas `NEXT_PUBLIC_*` expostos ao cliente |

### Backend (FastAPI / Render)

Middleware chain (ordem de execução — LIFO no Starlette):

```
Request → SecurityHeaders → CORS → CSRF → BodySizeLimit → RLS → Route Handler
```

| Controle | Implementação |
|---|---|
| Security Headers | `app/security/headers.py` — HSTS em prod, sem X-XSS-Protection |
| CORS | `main.py` — origins explícitos, sem wildcard |
| CSRF | `app/security/csrf.py` — double-submit cookie + HMAC |
| Body size limit | `app/security/body_limit.py` — 1MB padrão, 16MB em uploads |
| Row Level Security | Toda tabela com RLS habilitado + políticas por `auth.uid()` |
| Rate limiting | `slowapi` + Upstash Redis — por IP e por endpoint |
| Brute force | `app/services/auth.py` — Redis counter, lockout em 10 falhas, delay progressivo |
| Flood protection | `app/services/chat.py` — max 10 msgs/min/usuário/grupo + dedup 30s |
| Input sanitization | `bleach.clean()` em todos os inputs de texto |
| Tiptap sanitization | `app/security/tiptap.py` — allowlist de nodes/marks, bloqueia javascript: URIs |
| File upload security | Magic bytes + Pillow re-encode WebP + strip EXIF |
| Structured logging + PII | `structlog` com `_pii_filter_processor` — máscara emails, redact tokens |
| Sentry PII scrubbing | `main.py` `_sentry_before_send` — strip cookies, auth header, email |
| SQL injection | SQLAlchemy ORM apenas; `text()` apenas com validação UUID explícita |
| JWT | HS256 + blacklist Redis + session tracking + rotation |
| Cookies | httpOnly, secure, sameSite=lax, max_age explícito |
| Timing attacks | `hmac.compare_digest()` para tokens, bcrypt para senhas |
| Email enumeration | Todas as respostas de auth retornam mensagem idêntica |
| Audit log | `app/services/audit.py` — imutável, fire-and-forget, RLS read-own |

---

## Modelo de Acesso ao Storage (R2)

```
Bucket: bookclubinho
├── avatars/           ← PUBLIC (CDN via S3_PUBLIC_URL)
├── groups/            ← PUBLIC (CDN via S3_PUBLIC_URL)
├── media/             ← PRIVATE (presigned GET, 1h expiry)
└── exports/           ← PRIVATE (presigned GET, 1h expiry)
```

**Bucket policy:** permite `s3:GetObject` apenas em `avatars/*` e `groups/*`.

`get_public_url(path)` detecta o prefixo automaticamente e retorna URL pública ou presigned.

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

Refresh automático: POST /auth/refresh com refresh cookie
Logout: DELETE /auth/logout — blacklist JWT no Redis + clear cookies

Google OAuth:
  1. GET /auth/google → redirect para Google
  2. GET /auth/google/callback → troca code por tokens → set cookies

Magic Link:
  1. POST /auth/magic-link → gera token assinado → email via Resend
  2. GET /auth/magic-link/verify?token=... → valida → set cookies
```

---

## Modelo de Dados — Relacionamentos Principais

```
User
 ├── UserSession (1:N) — sessões ativas com device tracking
 ├── GroupMember (1:N) — memberships em grupos
 ├── ReadingProgress (1:N) — snapshots imutáveis
 ├── UserBadge (1:N) — conquistas
 └── AuditLog (1:N) — eventos de segurança

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
Producer: backend escreve eventos em bookclub:group:{group_id}
Consumer: GET /api/v1/groups/{id}/stream — XREAD BLOCK 0
Frontend: EventSource → atualiza UI via React Query invalidation
```

Não usa WebSockets — SSE é suficiente para o caso de uso (unidirecional server→client).

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

Deploy automático:
  ├── Backend + worker + Postgres → Render Blueprint
  └── Frontend → Vercel (push to master)
```
