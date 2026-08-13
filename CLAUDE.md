# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Read this file before anything else. It is the project's source of truth for coding agents.

---

## Agent Workflow (Mandatory)

- **New branch:** Always start a task by creating a new, descriptive branch.
- **Git best practices:** Follow Git best practices (clear commit messages, atomic commits).
- **Push & PR:** When you're done, push the branch and open a Pull Request (do not mention Claude Code in the PR or in the commit message).
- **Co-authorship:** **NEVER** add yourself as a co-author of the project on GitHub.
- **Unit tests:** Always create or update unit tests at the end of every request.
- **Bug fixes:** When asked to fix a bug, **first write a test that reproduces it and fails because of it**, then implement the fix until the test passes.

---

## What this project is

A book club web app: reading groups with book voting (Hardcover API), iMessage-style chat, reading tracking with streaks, post-book reviews, meetings, badges, and an annual wrapped.

**Codename:** `bookclub`

---

## Stack

**Frontend (Vercel):** Next.js 16+ App Router, TypeScript strict, Tailwind CSS, shadcn/ui (new-york), Framer Motion, Zustand, React Query, Tiptap

**Backend (Render):** FastAPI Python 3.12+, Pydantic v2, SQLAlchemy 2.0 async + asyncpg, Alembic

**Infra:** PostgreSQL on Render, Upstash Redis (HTTP for cache, TCP for SSE), Cloudflare R2 (storage), Resend (email), Hardcover GraphQL (books)

**Auth:** httpOnly cookies + JWT HS256 + OAuth2 Google + magic link

**Local dev:** Docker Compose only for postgres + redis + minio. The app runs outside Docker.

---

## Monorepo Structure

```
/frontend          → Next.js — Vercel
  /src/app         → App Router pages and layouts
  /src/components  → Components
  /src/lib         → Helpers, clients, utils
  /src/stores      → Zustand stores
/backend           → FastAPI — Render
  /app/api         → Routers
  /app/core        → config, security, deps
  /app/db          → engine, models, migrations
  /app/schemas     → Pydantic schemas
  /app/services    → business logic + external APIs
  /app/workers     → notification worker, etc.
  /app/storage     → R2/S3 helpers
  /app/security    → sanitizer, rate limit
  /alembic         → migrations
/infra             → docker-compose.yml, .env.example
/docs              → ARCHITECTURE.md, SETUP.md, RUNBOOK.md
/.claude/agents/   → Specialized subagents
```

---

## Domain Model

- **User** — account, profile, streak, stats
- **Group** — a club with an invite_code, max 8 members
- **GroupMember** — the user↔group relation (role: admin/member)
- **Round** — a round: `nominating → voting → reading → reviewing → finished`
- **RoundNomination** — a book nomination (max 3 per round per user)
- **RoundVote** — 1 vote per user per round
- **ReadingProgress** — an immutable snapshot (page/chapter/percentage/finished)
- **ReadingSession** — a reading timer session
- **GroupMessage** — a chat message (text/image/gif/quote/chapter_marker/spoiler)
- **MessageReaction** — emoji reactions
- **Meeting** — a club meeting with RSVPs
- **BookReview** — stars + booleans (did you cry? did you love it? etc.) + text
- **Badge + UserBadge** — achievements
- **HallOfQuote** — the group's notable quotes
- **AuditLog** — a security log of every event

---

## Code Conventions

**Python:** ruff for lint/format, type hints everywhere, async by default, snake_case, SQLAlchemy ORM only (no raw SQL), `Depends()` for dependency injection, structlog for logs.

**TypeScript:** strict mode, prefer Server Components, Tailwind only (no custom CSS), camelCase for vars/functions, PascalCase for components, kebab-case for files/routes.

**React composition:** Pages should be thin — they orchestrate components, they don't hold logic. Extract forms, sections, and visual blocks into reusable components (`src/components/`). Custom hooks for state/fetch logic. Always consult the `vercel-composition-patterns`, `vercel-react-best-practices`, `next-best-practices`, `web-design-guidelines`, and `frontend-design` skills when creating or modifying frontend code.

---

## API Conventions

- All routes under `/api/v1/`
- Auth via httpOnly cookies — never an Authorization header
- Cursor-based pagination — never offset
- Standard error shape: `{"detail": "message"}` — never stack traces or internal info
- SSE for realtime via Redis Streams — not WebSockets
- Rate limiting via slowapi + Upstash Redis

---

## Visual Design

**The palette's source of truth is `frontend/src/app/globals.css`.** This file describes what's there; when they diverge, the code wins and this section is what gets corrected.

- **Surfaces:** warm cream in light (`oklch(0.96 0.028 78)`), warm charcoal in dark (`oklch(0.17 0.018 75)`). It is warm charcoal, **not brown** — full brown competes with the book covers, which are the content.
- **Accent:** sage green (`oklch(0.52 0.08 152)` / `oklch(0.68 0.07 152)` in dark). Off the neutral ramp.
- **Chroma has two levels:** surfaces carry the warmth because they are 100% of the screen; text goes less than halfway down the same path. High chroma in body text reads as a sepia filter and tires the eye over a long read. Text ceiling: `0.04`.
- **Shades via oklch, always.** No 6-digit hex in a component — the lint and `src/app/__tests__/palette.test.ts` cover this.
- **The `brand-*` scale** is the warm celebration ramp (wrapped, badges), more chromatic than the ordinary surfaces. Don't use it as an everyday UI surface.
- Dark mode via next-themes + a cookie (no flash). The cookie is read on the server; the client uses `localStorage` with the same key.
- Animations: Framer Motion 150-300ms, respect `prefers-reduced-motion`
- Touch targets at least 44px, mobile-first always

**Trap:** the `em-emoji-picker` block in `globals.css` duplicates tokens as RGB triplets — the Web Component does not accept `var()`. Changing a token referenced there requires recomputing the triplet; the palette test is what warns you.

---

## Security — Non-Negotiable Rules

- **ROW LEVEL SECURITY (RLS) IS ALWAYS MANDATORY** — every table in PostgreSQL must have RLS enabled with explicit policies. Never disable it.
  - **But today it is not being enforced, and you cannot rely on it.** The app connects with a superuser role, and a superuser bypasses RLS — even with `FORCE ROW LEVEL SECURITY`. The policies exist and are correct; the gate only closes when the service's `DATABASE_URL` points at a restricted role (no `SUPERUSER`, no `BYPASSRLS`, not owning the tables). The procedure is in `docs/RUNBOOK.md`.
  - The practical consequence when writing an endpoint: **scope every query in the application** as if RLS did not exist, because right now it doesn't. Use `GroupMemberDep`/`GroupAdminDep` and `membership.resolve` instead of assuming the database filters.
- NEVER expose stack traces, table names, or internal paths in responses
- NEVER ADD YOURSELF AS A CO-AUTHOR OF THE PROJECT ON GITHUB
- NEVER put secrets in the frontend — only `NEXT_PUBLIC_*`
- NEVER use raw SQL in the application — ORM only
- NEVER use `dangerouslySetInnerHTML` without DOMPurify (the lint blocks the PR)
- NEVER put tokens in localStorage/sessionStorage — httpOnly cookies only
- All user input: sanitize via `bleach.clean()` on the backend
- Uploads: validate magic bytes (not the MIME header), re-encode via Pillow, strip EXIF
- Auth responses always identical regardless of the error (email enumeration)
- CSRF via a double-submit cookie on every mutating endpoint
- Token comparisons via `hmac.compare_digest()` — not `==`

---

## Common Traps

- **N+1 queries:** use `selectinload`/`joinedload` — never iterate over lazy relationships
- **Loading states:** every fetch needs a skeleton — no exceptions
- **Mobile:** test at 375px — looking good on desktop is not enough
- **SSE + Upstash:** use the TCP connection (`REDIS_URL`) for `XREAD/BLOCK` — not the HTTP API
- **Migrations:** `alembic upgrade head` runs before the server — it's in the Docker `CMD` that Render uses
- **R2 public vs. private:** avatars/groups = public; media/exports = private via presigned URLs
- **Streak timezone:** compute 'today' in the user's timezone, not UTC
- **Review spoilers:** `GET /rounds/{id}/reviews` requires that the user has submitted their own review

---

## Subagents (`/.claude/agents/`)

- `db-architect` — invoke before any migration or complex query
- `security-reviewer` — every PR touching auth, uploads, or user input
- `api-reviewer` — PRs with new FastAPI endpoints
- `frontend-reviewer` — PRs with React components
- `ux-reviewer` — PRs that touch pages or layouts
- `test-writer` — after implementing features
- `doc-writer` — after architecture changes

---

## Configured MCPs

postgres · filesystem · github · memory · context7 · exa

---

## Agent skills

### Issue tracker

Issues live in the GitHub Issues of `fe-m-bueno/bookclubinho`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

A standard five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.

---

> Architecture questions → `/docs/ARCHITECTURE.md`
> Deploy broken → `/docs/RUNBOOK.md`
> Setup from scratch → `/docs/SETUP.md`
