# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Leia este arquivo antes de qualquer coisa. Fonte da verdade do projeto para agentes de código.

---

## Workflow do Agente (Obrigatório)

- **Nova Branch:** Sempre inicie uma tarefa criando uma nova branch descritiva.
- **Git Best Practices:** Siga as melhores práticas de Git (mensagens de commit claras, commits atômicos).
- **Push & PR:** Ao finalizar, realize o push da branch e crie um Pull Request (não coloque menção ao claude code no PR nem na commit message).
- **Co-autoria:** **NUNCA** se adicione como co-autor do projeto no GitHub.
- **Testes Unitários:** Sempre crie ou atualize testes unitários ao final de cada solicitação.
- **Correção de Bugs:** Ao receber um pedido para resolver um bug, **primeiro escreva um teste que reproduza e falhe por causa do bug**, depois implemente a correção até o teste passar.

---

## O que é esse projeto

Webapp de clube do livro: grupos de leitura com votação de livros (Hardcover API), chat estilo iMessage, tracking de leitura com streaks, reviews pós-livro, encontros, badges e wrapped anual.

**Codename:** `bookclub`

---

## Stack

**Frontend (Vercel):** Next.js 16+ App Router, TypeScript strict, Tailwind CSS, shadcn/ui (new-york), Framer Motion, Zustand, React Query, Tiptap

**Backend (Render):** FastAPI Python 3.12+, Pydantic v2, SQLAlchemy 2.0 async + asyncpg, Alembic

**Infra:** PostgreSQL no Render, Upstash Redis (HTTP para cache, TCP para SSE), Cloudflare R2 (storage), Resend (email), Hardcover GraphQL (livros)

**Auth:** httpOnly cookies + JWT HS256 + OAuth2 Google + magic link

**Dev local:** Docker Compose só para postgres + redis + minio. App roda fora do Docker.

---

## Estrutura do Monorepo

```
/frontend          → Next.js — Vercel
  /src/app         → App Router pages e layouts
  /src/components  → Componentes
  /src/lib         → Helpers, clients, utils
  /src/stores      → Zustand stores
/backend           → FastAPI — Render
  /app/api         → Routers
  /app/core        → config, security, deps
  /app/db          → engine, models, migrations
  /app/schemas     → Pydantic schemas
  /app/services    → lógica de negócio + APIs externas
  /app/workers     → notification worker etc
  /app/storage     → helpers R2/S3
  /app/security    → sanitizer, rate limit
  /alembic         → migrations
/infra             → docker-compose.yml, .env.example
/docs              → ARCHITECTURE.md, SETUP.md, RUNBOOK.md
/.claude/agents/   → Subagents especializados
```

---

## Modelo de Domínio

- **User** — conta, perfil, streak, stats
- **Group** — clube com invite_code, max 8 membros
- **GroupMember** — relação user↔group (role: admin/member)
- **Round** — rodada: `nominating → voting → reading → reviewing → finished`
- **RoundNomination** — indicação de livro (max 3/rodada por usuário)
- **RoundVote** — 1 voto por usuário por rodada
- **ReadingProgress** — snapshot imutável (page/chapter/percentage/finished)
- **ReadingSession** — sessão do timer de leitura
- **GroupMessage** — mensagem do chat (text/image/gif/quote/chapter_marker/spoiler)
- **MessageReaction** — emoji reactions
- **Meeting** — encontro do clube com RSVPs
- **BookReview** — estrelas + booleans (chorou? amou? etc) + textos
- **Badge + UserBadge** — conquistas
- **HallOfQuote** — quotes notáveis do grupo
- **AuditLog** — log de segurança de todos os eventos

---

## Convenções de Código

**Python:** ruff para lint/format, type hints em tudo, async por padrão, snake_case, só SQLAlchemy ORM (zero SQL raw), `Depends()` para injeção de dependências, structlog para logs.

**TypeScript:** strict mode, preferir Server Components, Tailwind only (zero CSS custom), camelCase para vars/funções, PascalCase para componentes, kebab-case para arquivos/rotas.

**Composição React:** Pages devem ser finas — orquestram componentes, não contêm lógica. Extrair formulários, seções e blocos visuais em componentes reutilizáveis (`src/components/`). Hooks customizados para lógica de estado/fetch. Sempre consultar as skills `vercel-composition-patterns`, `vercel-react-best-practices`, `next-best-practices`, `web-design-guidelines` e `frontend-design` ao criar ou modificar código frontend.

---

## Padrões de API

- Todas as rotas sob `/api/v1/`
- Auth via httpOnly cookies — nunca Authorization header
- Paginação cursor-based — nunca offset
- Erro padrão: `{"detail": "mensagem"}` — nunca stack traces ou info interna
- SSE para realtime via Redis Streams — não WebSockets
- Rate limiting via slowapi + Upstash Redis

---

## Design Visual

**A fonte da verdade da paleta é `frontend/src/app/globals.css`.** Este arquivo descreve o que está lá; ao divergirem, o código ganha e esta seção é que se corrige.

- **Superfícies:** creme quente no light (`oklch(0.96 0.028 78)`), carvão quente no dark (`oklch(0.17 0.018 75)`). É carvão quente, **não marrom** — marrom cheio compete com as capas de livro, que são o conteúdo.
- **Acento:** sage green (`oklch(0.52 0.08 152)` / `oklch(0.68 0.07 152)` no dark). Fora da rampa neutra.
- **Croma tem dois níveis:** superfícies carregam o calor porque são 100% da tela; texto sobe menos da metade do mesmo caminho. Croma alto em corpo de texto lê como filtro sépia e cansa em leitura longa. Teto de texto: `0.04`.
- **Shades via oklch, sempre.** Zero hex de 6 dígitos em componente — o lint e `src/app/__tests__/palette.test.ts` cobrem isso.
- **Escala `brand-*`** é a rampa quente de celebração (wrapped, badges), mais cromática que as superfícies comuns. Não usar como superfície de UI cotidiana.
- Dark mode via next-themes + cookie (sem flash). O cookie é lido no servidor; o cliente usa `localStorage` com a mesma chave.
- Animações: Framer Motion 150-300ms, respeitar `prefers-reduced-motion`
- Touch targets mínimo 44px, mobile-first sempre

**Armadilha:** o bloco `em-emoji-picker` no `globals.css` duplica tokens como triplets RGB — o Web Component não aceita `var()`. Mudar um token citado ali exige recalcular o triplet; o teste de paleta é o que avisa.

---

## Segurança — Regras Não-Negociáveis

- **ROW LEVEL SECURITY (RLS) É OBRIGATÓRIO SEMPRE** — toda tabela no PostgreSQL deve ter RLS habilitado com políticas explícitas. Nunca desabilitar.
  - **Mas hoje ele não está sendo aplicado, e você não pode contar com ele.** O app conecta com um papel superusuário, e superusuário ignora RLS — inclusive com `FORCE ROW LEVEL SECURITY`. As políticas existem e estão corretas; o portão só fecha quando o `DATABASE_URL` do serviço apontar para um papel restrito (sem `SUPERUSER`, sem `BYPASSRLS`, sem posse das tabelas). Procedimento em `docs/RUNBOOK.md`.
  - Consequência prática ao escrever endpoint: **escope toda query na aplicação** como se RLS não existisse, porque agora não existe. Use `GroupMemberDep`/`GroupAdminDep` e `membership.resolve` em vez de assumir que o banco filtra.
- NUNCA expor stack traces, tabelas, paths internos em respostas
- NUNCA SE COLOQUE COMO CO-AUTOR DO PROJETO NO GITHUB
- NUNCA secrets no frontend — só `NEXT_PUBLIC_*`
- NUNCA SQL raw na aplicação — só ORM
- NUNCA `dangerouslySetInnerHTML` sem DOMPurify (lint bloqueia PR)
- NUNCA tokens em localStorage/sessionStorage — só httpOnly cookies
- Todo input do usuário: sanitizar via `bleach.clean()` no backend
- Upload: validar magic bytes (não MIME header), re-encodar via Pillow, strip EXIF
- Respostas de auth sempre idênticas independente do erro (email enumeration)
- CSRF via double-submit cookie em todos os endpoints mutantes
- Comparações de tokens via `hmac.compare_digest()` — não `==`

---

## Armadilhas Comuns

- **N+1 queries:** usar `selectinload`/`joinedload` — nunca iterar sobre relacionamentos lazy
- **Loading states:** todo fetch precisa de skeleton — sem exceção
- **Mobile:** testar em 375px — se parece bom no desktop, não é suficiente
- **SSE + Upstash:** usar conexão TCP (`REDIS_URL`) para `XREAD/BLOCK` — não HTTP API
- **Migrations:** `alembic upgrade head` roda antes do servidor — está no Docker `CMD` usado pelo Render
- **R2 público vs privado:** avatars/groups = público; media/exports = privado via presigned URLs
- **Streak timezone:** calcular 'hoje' pelo timezone do usuário, não UTC
- **Reviews spoiler:** `GET /rounds/{id}/reviews` exige que o usuário tenha submetido a própria review

---

## Subagents (`/.claude/agents/`)

- `db-architect` — acionar antes de qualquer migration ou query complexa
- `security-reviewer` — todo PR com auth, upload ou input de usuário
- `api-reviewer` — PRs com novos endpoints FastAPI
- `frontend-reviewer` — PRs com componentes React
- `ux-reviewer` — PRs que tocam páginas ou layouts
- `test-writer` — após implementar features
- `doc-writer` — após mudanças de arquitetura

---

## MCPs Configurados

postgres · filesystem · github · memory · context7 · exa

---

## Agent skills

### Issue tracker

Issues vivem no GitHub Issues de `fe-m-bueno/bookclubinho`, via `gh` CLI. Ver `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulário padrão de cinco papéis (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Ver `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` na raiz. Ver `docs/agents/domain.md`.

---

> Dúvidas de arquitetura → `/docs/ARCHITECTURE.md`
> Deploy quebrou → `/docs/RUNBOOK.md`
> Setup do zero → `/docs/SETUP.md`
