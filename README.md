# Bookclubinho

A collaborative platform for running reading groups: create clubs, vote on books, track reading progress, discuss, and share the experience in one place.

[Full documentation](./docs) · [Quick setup](./GETTING_STARTED.md) · [Deploy](./DEPLOY.md) · [Architecture](./docs/ARCHITECTURE.md) · [Production runbook](./docs/RUNBOOK.md)

---

## Overview

Bookclubinho is a full-stack web app that makes the book club experience digital. Users can:

- **Create or join reading groups** of up to 8 members
- **Nominate and vote on books** (with a Hardcover API integration for the catalog)
- **Track reading progress**, with a consecutive-day streak
- **Chat in real time**, iMessage-style — messages, emoji reactions, quotes
- **Write reviews** after finishing a book (star rating + characteristics)
- **Schedule club meetings** with member RSVPs
- **Unlock badges** for milestones (reading, activity, community)
- **View an annual Wrapped** with personalized statistics

---

## Tech Stack

### Frontend

- **Framework:** Next.js 16+ with the App Router
- **Language:** TypeScript strict mode
- **Styling:** Tailwind CSS + shadcn/ui (new-york)
- **Animation:** Framer Motion
- **State:** Zustand
- **HTTP:** React Query (TanStack Query)
- **Rich text editor:** Tiptap
- **Deploy:** Vercel

### Backend

- **Framework:** FastAPI with Python 3.12+
- **Validation:** Pydantic v2
- **Database:** SQLAlchemy 2.0 async + asyncpg
- **Migrations:** Alembic
- **Auth:** httpOnly cookies + JWT HS256 + OAuth2 Google + magic link
- **Cache & realtime:** Upstash Redis (HTTP for cache, TCP for SSE)
- **Rate limiting:** slowapi + Redis
- **Structured logs:** structlog
- **Deploy:** Render

### Infrastructure

- **Database:** PostgreSQL (Render)
- **Cache & realtime:** Upstash Redis (TCP + HTTP)
- **Storage:** Cloudflare R2 (avatars, media, exports)
- **Transactional email:** Resend
- **Books:** Hardcover GraphQL API
- **Observability:** Sentry (errors + performance)
- **DNS/CDN:** Cloudflare

### Local Development

Docker Compose provides:
- PostgreSQL 16 (port 5432)
- Redis 7 (port 6379)
- MinIO (local S3-compatible storage, port 9000)

The frontend and backend run **natively on the host** (not in Docker) for hot reload.

---

## Prerequisites

- **Node.js** 18+ (npm/yarn/pnpm)
- **Python** 3.12+
- **Docker** + **Docker Compose**
- **Git**

---

## Quick Start

### 1. Clone and Install the Dependencies

```bash
git clone <repo-url>
cd bookclubinho

# Frontend
cd frontend
npm install
cd ..

# Backend
cd backend
pip install -r requirements.txt
cd ..
```

### 2. Configure the Environment Variables

**Frontend** (`.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Backend** (`.env`):
```env
DATABASE_URL=postgresql+asyncpg://bookclub:bookclub@localhost:5432/bookclub
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-dev-key
ENVIRONMENT=dev
```

For the full details, see [GETTING_STARTED.md](./GETTING_STARTED.md).

### 3. Start the Infrastructure

```bash
make up
```

### 4. Apply the Migrations

```bash
make migrate
```

### 5. Start the Services (in separate terminals)

```bash
# Terminal 1
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd frontend
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Project Structure

```
bookclubinho/
├── frontend/                 # Next.js 16+ app
│   ├── src/
│   │   ├── app/             # App Router pages and layouts
│   │   ├── components/      # Reusable components
│   │   ├── lib/             # Helpers, HTTP clients, utilities
│   │   └── stores/          # Zustand stores
│   ├── package.json
│   └── next.config.ts
│
├── backend/                  # FastAPI Python
│   ├── app/
│   │   ├── api/             # API routers
│   │   ├── core/            # Config, security, dependencies
│   │   ├── db/              # SQLAlchemy models, engine, seeds
│   │   ├── schemas/         # Pydantic schemas (request/response)
│   │   ├── services/        # Business logic + external APIs
│   │   ├── workers/         # Background tasks, notifications
│   │   ├── security/        # Sanitization, CSRF, rate limiting
│   │   └── storage/         # R2/S3 helpers
│   ├── alembic/             # Database migrations
│   ├── main.py              # FastAPI entry point
│   ├── pyproject.toml
│   └── requirements.txt
│
├── infra/                    # Local infrastructure
│   ├── docker-compose.yml
│   └── .env.example
│
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md       # Architecture overview
│   ├── RUNBOOK.md            # Operational procedures
│   └── SETUP.md              # Detailed setup
│
├── .claude/                  # Specialized subagents
│   ├── agents/
│   └── contexts/
│
├── Makefile                  # Development shortcuts
├── CLAUDE.md                 # Instructions for Claude Code
├── GETTING_STARTED.md        # Step-by-step local setup
└── README.md                 # This file
```

---

## Development Commands

### Infrastructure

```bash
make up              # Start PostgreSQL, Redis, MinIO
make down            # Stop the containers (data preserved)
make reset           # Destroy everything and recreate from scratch
make logs            # Watch the logs live
```

### Database

```bash
make migrate         # Apply the migrations (alembic upgrade head)
make migration msg="description"  # Create a new migration
make migrate-down    # Revert the last migration
make seed            # Populate with test data
```

### Frontend

```bash
cd frontend
npm run dev          # Development server (port 3000)
npm run build        # Production build
npm run lint         # ESLint check
npm test             # Run the tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
```

### Backend

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000  # Dev server
python -m pytest                          # Run the tests
ruff check . && ruff format .             # Lint + format
```

---

## Architecture

### Security

- **RLS (Row Level Security)** enabled on every table
- **CSRF** via a double-submit cookie
- **Rate limiting** with Upstash Redis
- **Auth:** httpOnly cookies + JWT HS256
- **Input sanitization:** bleach.clean() on the backend
- **File uploads:** magic-byte validation + re-encode + EXIF strip
- **PII masking:** Sentry + structlog with scrubbers

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full details.

### Realtime

- SSE (Server-Sent Events) via Redis Streams (Upstash TCP)
- No WebSockets — SSE is enough for this use case

### Authentication

```
httpOnly cookies (access + refresh) + JWT HS256
+ OAuth2 Google
+ Magic link (passwordless email)
```

### Storage

- **Public:** avatars, group images → Cloudflare R2 via CDN
- **Private:** media, exports → R2 with presigned URLs (1h expiry)

---

## Data Model

The main entities:

- **User** — account, profile, streak, stats
- **Group** — a club (max 8 members, invite_code)
- **Round** — a voting/reading round (5 states: nominating → voting → reading → reviewing → finished)
- **RoundNomination** — a book nomination
- **RoundVote** — a vote for a book
- **ReadingProgress** — immutable progress snapshots
- **GroupMessage** — chat (text/image/gif/quote/chapter_marker/spoiler)
- **BookReview** — a post-book review (rating + characteristics)
- **Meeting** — a club meeting
- **Badge + UserBadge** — unlocked achievements
- **AuditLog** — an immutable security log

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full diagram.

---

## Code Conventions

### Python

- **Lint/Format:** ruff (no compromises)
- **Type hints:** required everywhere
- **Async by default**
- **snake_case** for variables and functions
- **SQLAlchemy ORM only** — no raw SQL (except validated `text()`)
- **Dependency injection:** FastAPI `Depends()`
- **Logs:** structlog with a PII scrubber

### TypeScript

- **Strict mode** required
- **PascalCase** for components
- **camelCase** for functions and variables
- **kebab-case** for files and routes
- **Server Components** by default
- **Tailwind only** — no custom CSS

### Non-Negotiable Security

- ✅ RLS enabled on every table
- ✅ No stack traces in public responses
- ✅ No secrets in the frontend (only `NEXT_PUBLIC_*`)
- ✅ No `dangerouslySetInnerHTML` without DOMPurify
- ✅ No tokens in localStorage
- ✅ Sanitization via bleach.clean() and a Tiptap allowlist
- ✅ File upload: magic-byte validation + Pillow re-encode + EXIF strip
- ✅ Auth responses: always identical (no email enumeration)

---

## API Conventions

- All routes live under `/api/v1/*`
- Auth via **httpOnly cookies** (never an Authorization header)
- Pagination: **cursor-based** (never offset)
- Standard error shape: `{"detail": "message"}`
- Realtime: SSE via Redis Streams (TCP)
- Rate limiting: slowapi + Upstash Redis

---

## Contributing

1. **Create a descriptive branch:**
   ```bash
   git checkout -b feat/feature-description
   # or
   git checkout -b fix/bug-description
   ```

2. **Follow the conventions:**
   - Read [CLAUDE.md](./CLAUDE.md) for code instructions
   - Atomic commits, with messages written in Portuguese
   - Unit tests for new features

3. **Test locally:**
   ```bash
   # Frontend
   npm run lint
   npm test

   # Backend
   ruff check . && python -m pytest
   ```

4. **Open a Pull Request:**
   - Title and description written in Portuguese
   - Reference any related issues
   - Wait for code review

5. **Merge to master:**
   - Automatic deploy to Vercel + Render
   - Migrations run before the server starts

---

## Troubleshooting

### Database Connection Error

```bash
docker compose -f infra/docker-compose.yml ps
# If it isn't running:
make up
```

### Port Already in Use

```bash
# Next.js
npm run dev -- -p 3001

# FastAPI
uvicorn main:app --reload --port 8001
```

### "ModuleNotFoundError: No module named 'fastapi'"

```bash
cd backend
pip install -r requirements.txt
```

### Redis Won't Connect

Check `REDIS_URL` in `.env` (it should point at the local Redis in dev):
```env
REDIS_URL=redis://localhost:6379
```

### SSE Doesn't Work

Make sure you are using Upstash's **TCP connection** (not HTTP):
```env
# Correct
REDIS_URL=redis://localhost:6379

# Wrong (that's the HTTP API)
REDIS_URL=https://...
```

For more, see [GETTING_STARTED.md](./GETTING_STARTED.md).

---

## Production Monitoring

- **Sentry:** errors + performance tracing (separate DSNs for backend/frontend)
- **Render:** application logs, deploys, and backend/worker metrics
- **Runbook:** credential and incident procedures in [docs/RUNBOOK.md](./docs/RUNBOOK.md)

---

## Roadmap

- [ ] Goodreads integration (import a shelf)
- [ ] Web push notifications
- [ ] Improved dark mode
- [ ] Native mobile app (React Native)
- [ ] Private clubs (invite-only)
- [ ] Statistics by author/genre

---

## License

Private property. Use restricted to the authorized team.

---

## Support

- **Setup questions?** Read [GETTING_STARTED.md](./GETTING_STARTED.md)
- **Deploy broken?** See [docs/RUNBOOK.md](./docs/RUNBOOK.md)
- **Architecture?** Check [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Code instructions?** [CLAUDE.md](./CLAUDE.md)

---

**Last updated:** 2026-03-24
