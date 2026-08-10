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
| Row Level Security | Toda tabela com RLS habilitado + políticas por `app.current_user_id`. **Não aplicado hoje** — o app conecta como superusuário, que ignora RLS. Ver abaixo. |
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

### RLS: escrito, correto, e ainda não aplicado

O app conecta com um papel superusuário, e superusuário **não avalia política** —
nem com `FORCE ROW LEVEL SECURITY`. Então as 86 políticas do schema hoje não
barram nada: a aplicação é o guarda único.

Isso não é aspiracional nem quebrado — é um passo de configuração pendente. As
migrations 0025–0027 corrigiram os cinco defeitos que impediam a troca, e o fluxo
completo foi verificado com o app num papel sem `BYPASSRLS` e sem posse das
tabelas. Falta apontar o `DATABASE_URL` do serviço web para esse papel,
mantendo o privilegiado nas migrations. Procedimento, verificação e rollback em
`docs/RUNBOOK.md`.

**Ao escrever endpoint, escope a query na aplicação.** Não presuma que o banco
filtra por usuário, porque hoje ele não filtra. `membership.resolve` e os
`GroupMemberDep`/`GroupAdminDep` são o que de fato protege.

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

**URL de prefixo privado é apresentação, não dado.** O que se persiste é a chave do objeto —
`group_messages.media_key` guarda `media/{group_id}/{uuid}.webp`, e a URL é resolvida a cada
serialização. Guardar a presigned URL fazia a imagem do chat quebrar uma hora depois. O cliente
devolve a chave do upload no POST da mensagem, e o backend valida que ela pertence ao grupo.

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

### Personal access tokens (clientes que não são browser)

Cookie httpOnly + CSRF é a resposta certa para o browser, e só para ele: as duas
peças existem porque o browser anexa cookie sozinho. Uma CLI ou um agente não
têm esse problema, então usam `Authorization: Bearer <token>`.

```
POST   /api/v1/auth/tokens       cria — devolve o segredo uma única vez
GET    /api/v1/auth/tokens       lista (só prefixo, nunca o segredo)
DELETE /api/v1/auth/tokens/{id}  revoga

curl -H "Authorization: Bearer bcp_xxx" $API/users/me
```

Quatro decisões que valem mais que o código:

- **Só o hash vai para o banco** (SHA-256, não bcrypt — o token são 256 bits que
  nós sorteamos, não há o que adivinhar; ver `core/security.py`).
- **Gerenciar tokens exige sessão de browser.** Um PAT não cria nem revoga PATs,
  senão um token vazado vira permanente e expulsa o dono — `deps.SessionOnlyUser`.
- **CSRF é dispensado só quando não há cookie de sessão junto.** Com cookie
  presente a validação continua valendo, senão um `Authorization` inventado
  desligaria o CSRF de uma requisição autenticada por cookie.
- **O cookie vence o Bearer** quando os dois vêm na mesma requisição.

O contexto RLS deste caminho é aplicado na dependência, não no `RLSMiddleware`:
o middleware roda antes de existir sessão de banco, e resolver token opaco exige
um SELECT. Ver `deps._resolve_bearer_user_id` e o comentário da migration 0024.

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
