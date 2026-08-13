# Local Setup Guide — Bookclubinho

Complete instructions for running the project locally on your machine. Read this guide all the way through before you start.

**Estimated time:** 15-20 minutes (the first time)

---

## Prerequisites

Before you start, make sure you have the following installed:

### Required

- **Node.js** 18+ (check with `node --version`)
- **npm** or **yarn** (ships with Node.js)
- **Python** 3.12+ (check with `python --version` or `python3 --version`)
- **Docker Desktop** (including Docker Compose)
  - Linux: install Docker and Docker Compose separately
  - macOS/Windows: Docker Desktop already includes Compose
- **Git** (to clone the repository)

### Optional for Development

- **A PostgreSQL GUI** (pgAdmin, DBeaver) to inspect the database
- **A Redis GUI** (Redis Insight) to inspect the cache
- **VSCode extensions:**
  - ESLint
  - Ruff (Python)
  - SQLAlchemy ORM (autocomplete)
  - Tailwind CSS IntelliSense

### Verifying the Installation

```bash
node --version        # Node.js
npm --version         # npm
python --version      # Python 3.12+
docker --version      # Docker
docker compose --version  # Docker Compose
git --version         # Git
```

---

## 1. Clone and Install the Dependencies

### Frontend

```bash
# From the project root
cd frontend
npm install
```

**What happens:**
- Downloads every dependency in `package.json` (Next.js, React, Tailwind, and so on)
- Creates the `node_modules/` folder
- Generates `package-lock.json` (if it doesn't exist)

**Expected time:** 2-3 minutes

### Backend

```bash
# From the project root
cd backend

# Create a virtual environment (RECOMMENDED)
python -m venv venv

# Activate the virtual environment
# On Linux/macOS:
source venv/bin/activate

# On Windows (PowerShell):
./venv/Scripts/Activate.ps1

# On Windows (CMD):
.\venv\Scripts\activate.bat

# Install the dependencies
pip install -r requirements.txt
```

**What happens:**
- Creates an isolated Python environment (venv)
- Installs FastAPI, SQLAlchemy, Pydantic, and so on
- Generates `site-packages/`

**Expected time:** 3-5 minutes

---

## 2. Configure the Environment Variables

### Frontend (`.env.local`)

Create the file `/frontend/.env.local`:

```bash
cd frontend
cat > .env.local << 'EOF'
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000

# Google OAuth (optional for local development)
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id

# Sentry (optional)
# NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
EOF
```

**Required variables:**
- `NEXT_PUBLIC_API_URL` — the backend's URL (should be http://localhost:8000 in dev)

**Optional variables:**
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — to test OAuth login (leave blank in dev)
- `NEXT_PUBLIC_SENTRY_DSN` — for error tracking (skippable in dev)

### Backend (`.env`)

Create the file `/backend/.env`:

```bash
cd backend
cat > .env << 'EOF'
# Database (PostgreSQL via Docker)
DATABASE_URL=postgresql+asyncpg://bookclub:bookclub@localhost:5432/bookclub

# Redis (cache + SSE) — use the local one during dev
REDIS_URL=redis://localhost:6379

# JWT secret (generate one with: openssl rand -hex 32)
JWT_SECRET=your-super-secret-dev-key-here-at-least-32-chars

# Environment
ENVIRONMENT=dev

# Resend (transactional email) — OPTIONAL
# RESEND_API_KEY=your_resend_api_key

# Google OAuth (OPTIONAL)
# GOOGLE_CLIENT_ID=your_google_client_id
# GOOGLE_CLIENT_SECRET=your_google_client_secret

# Sentry (OPTIONAL)
# SENTRY_DSN=your_sentry_dsn
EOF
```

**Required variables:**
- `DATABASE_URL` — the PostgreSQL connection string
- `REDIS_URL` — the Redis connection string (local in dev)
- `JWT_SECRET` — the JWT key (at least 32 characters)
- `ENVIRONMENT` — `dev` or `prod`

**Optional in dev:**
- `RESEND_API_KEY` — to send emails (skippable)
- `GOOGLE_CLIENT_ID/SECRET` — for Google OAuth (skippable)
- `SENTRY_DSN` — for error tracking (skippable)

**Generating a secure JWT_SECRET:**
```bash
openssl rand -hex 32
# Or in Python:
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## 3. Start the Infrastructure (PostgreSQL + Redis + MinIO)

From the **project root**, run:

```bash
make up
```

This will:
1. Start PostgreSQL on `localhost:5432`
2. Start Redis on `localhost:6379`
3. Start MinIO on `localhost:9000` (local S3-compatible storage)

**Check that everything is running:**

```bash
docker compose -f infra/docker-compose.yml ps
```

Expected:
```
NAME            STATUS
postgres        Up (healthy)
redis           Up (healthy)
minio           Up (healthy)
```

**If something doesn't start:**
```bash
# See the detailed logs
docker compose -f infra/docker-compose.yml logs postgres

# Restart everything
make down
make up
```

---

## 4. Apply the Migrations (Backend)

Create the tables in PostgreSQL:

```bash
make migrate
```

This runs `alembic upgrade head`, which:
- Reads the files in `/backend/alembic/versions/`
- Applies each migration in order
- Creates every table, index, and RLS policy

**If something goes wrong:**
```bash
# See the migration history
cd backend
alembic history

# Revert the last migration
alembic downgrade -1

# Reapply everything
alembic upgrade head
```

---

## 5. (Optional) Populate with Test Data

If you want some initial data for development:

```bash
make seed
```

This runs `/backend/app/db/seed.py` and populates:
- Test users
- Sample groups
- Rounds with books
- Chat messages
- Reviews

---

## 6. Start the Services

You need **3 separate terminals**:

### Terminal 1: FastAPI Backend

```bash
cd backend

# If you haven't activated the venv yet:
source venv/bin/activate  # or .\venv\Scripts\activate on Windows

# Start the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Expected:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

**Useful endpoints for testing:**
- `http://localhost:8000/api/v1/health` — Health check
- `http://localhost:8000/docs` — Swagger UI (interactive documentation)
- `http://localhost:8000/redoc` — ReDoc (reference documentation)

### Terminal 2: Next.js Frontend

```bash
cd frontend
npm run dev
```

**Expected:**
```
  ▲ Next.js 16.1.6
  - ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

**Open:**
- `http://localhost:3000` — the main application
- `http://localhost:3000/__nextjs_original-stack-frame` — dev errors

### Terminal 3 (Optional): Infrastructure Logs

Watch PostgreSQL, Redis, and MinIO live:

```bash
make logs
```

---

## 7. Open the Application

Open your browser at:

```
http://localhost:3000
```

You should see the landing page or the login screen.

**Testing the authentication flow:**

1. Click "Register" or "Login"
2. Create an account with an email + password
3. Join or create a group
4. Nominate a book
5. Vote

**Testing realtime chat:**

1. Open the same conversation in 2 browsers
2. Send a message in one
3. It should appear instantly in the other

---

## Troubleshooting

### ❌ "A Docker container won't start"

**Typical error:** `Error response from daemon: bind: address already in use`

**Fix:**
```bash
# Find which process is using the port
lsof -i :5432    # PostgreSQL
lsof -i :6379    # Redis
lsof -i :9000    # MinIO

# Kill the process (macOS/Linux)
kill -9 <PID>

# Or just use different ports:
# Edit docker-compose.yml and change the ports
```

---

### ❌ "The frontend won't start — npm error"

**Error:** `npm ERR! missing script: "dev"` or a dependency error

**Fix:**
```bash
cd frontend

# Clear the cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Try again
npm run dev
```

---

### ❌ "PostgreSQL connection error"

**Error:** `FATAL: password authentication failed for user "bookclub"`

**Fix:**
```bash
# Check that the container is running
docker compose -f infra/docker-compose.yml ps

# Check the environment variable in the backend
echo $DATABASE_URL  # or echo %DATABASE_URL% on Windows

# It should be:
# postgresql+asyncpg://bookclub:bookclub@localhost:5432/bookclub

# If the container isn't running:
make up

# If the error persists, reset everything:
make reset
make migrate
```

---

### ❌ "Migrations failing"

**Error:** `Error: Can't locate revision identified by 'base'` or similar

**Fix:**
```bash
cd backend

# See the history
alembic history

# Reset the database and migrations
make reset
make migrate

# Or manually:
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
alembic upgrade head
```

---

### ❌ "Port 3000 / 8000 already in use"

**Next.js on another port:**
```bash
npm run dev -- -p 3001
```

**FastAPI on another port:**
```bash
uvicorn main:app --reload --port 8001
```

---

### ❌ "Error loading ASGI app. Could not import module"

**Context:** Trying to run `uvicorn app.main:app` when the file is at `main.py`

**Fix (CORRECT):**
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

### ❌ "ModuleNotFoundError: No module named 'fastapi'"

**Fix:**
```bash
cd backend

# Make sure the venv is activated:
source venv/bin/activate  # Linux/macOS
# or
.\venv\Scripts\activate   # Windows

# Install again
pip install -r requirements.txt
```

**Checking that the venv is active:**
```bash
# The prompt should start with "(venv)"
which python       # Linux/macOS — should show venv/bin/python
Get-Command python # Windows — should show venv/Scripts/python
```

---

### ❌ "Redis won't connect for realtime (SSE)"

**Error:** Messages don't appear in real time, or an error when creating a chat

**Causes:**
1. Redis isn't running
2. `REDIS_URL` is wrong
3. You're using an HTTP URL instead of TCP

**Fix:**
```bash
# Check that Redis is running
docker compose -f infra/docker-compose.yml ps redis

# Check the backend's .env
cat backend/.env | grep REDIS_URL
# Should be: redis://localhost:6379

# In production (Upstash), use:
# REDIS_URL=redis://default:<token>@<host>:<port>

# NEVER use an HTTP URL in dev or prod:
# ❌ REDIS_URL=https://...
# ✅ REDIS_URL=redis://...
```

---

### ❌ "The MinIO bucket doesn't show up"

**Fix:**
```bash
# Open the MinIO web console
# http://localhost:9001

# Username: minioadmin
# Password: minioadmin

# Create the "bookclub-public" bucket if it doesn't exist
# Check that it's public (policy)
```

---

## Useful Makefile Commands

```bash
# Infrastructure
make up              # Starts PostgreSQL, Redis, MinIO
make down            # Stops the containers (data preserved)
make reset           # Destroys everything and recreates from scratch
make logs            # Tails the logs live

# Database
make migrate         # Applies every migration
make migration msg="description"  # Creates a new migration
make migrate-down    # Reverts the last migration
make seed            # Populates with test data

# Shortcut: all at once
make up && make migrate && make seed
```

---

## Structure at a Glance

```
bookclubinho/
├── frontend/          → Next.js 15+ App Router
├── backend/           → FastAPI Python
├── infra/             → docker-compose.yml
├── docs/              → Documentation
├── Makefile           → make shortcuts
├── CLAUDE.md          → Instructions for Claude Code
├── GETTING_STARTED.md → This file
└── README.md          → Project overview
```

---

## Next Steps After Setup

1. **Read CLAUDE.md**
   ```bash
   cat CLAUDE.md
   ```
   Code conventions, security, commit structure.

2. **Check ARCHITECTURE.md to understand the design**
   ```bash
   cat docs/ARCHITECTURE.md
   ```

3. **Explore the API's Swagger**
   - Open http://localhost:8000/docs
   - Test endpoints interactively

4. **Create an issue or a feature branch**
   ```bash
   git checkout -b feat/your-feature
   ```

5. **Check the troubleshooting section if something breaks**
   - See the section above
   - Or read `/docs/RUNBOOK.md` for production

---

## Development Tips

### Hot Reload

- **Frontend:** works automatically. Edit a file in `frontend/src/` and the browser refreshes
- **Backend:** enabled by `--reload` on uvicorn. Same thing

### Database

Inspecting the database during development:

```bash
# Via psql (if you have it installed)
psql -U bookclub -d bookclub -h localhost

# Or use pgAdmin:
# http://localhost:5050
# Username: admin@example.com
# Password: admin
```

### Logs

- **Backend:** structured as JSON on stdout (colored in dev)
- **Frontend:** the browser console + Next.js logs
- **Docker:** `make logs` for the infrastructure

### Performance

Monitoring in dev:
- **Frontend:** DevTools → Performance tab
- **Backend:** Sentry in production, logs in dev

---

## Resetting Everything From Scratch

If something gets badly broken:

```bash
# 1. Stop and clean up the containers
make reset

# 2. Clear node_modules and the cache
cd frontend && rm -rf node_modules .next && npm install
cd ../backend && rm -rf venv && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt

# 3. Apply the migrations
make migrate

# 4. Start again
# Terminal 1:
cd backend && source venv/bin/activate && uvicorn main:app --reload

# Terminal 2:
cd frontend && npm run dev
```

---

## Complete Setup Checklist

- [ ] Node.js 18+ installed (`node --version`)
- [ ] Python 3.12+ installed (`python --version`)
- [ ] Docker running (`docker ps`)
- [ ] Frontend dependencies installed (`frontend/npm install`)
- [ ] Backend venv created and activated
- [ ] Backend dependencies installed (`pip install -r requirements.txt`)
- [ ] Frontend `.env.local` created
- [ ] Backend `.env` created
- [ ] `make up` ran successfully
- [ ] `make migrate` ran successfully
- [ ] Backend running on `localhost:8000` (Swagger at `/docs`)
- [ ] Frontend running on `localhost:3000`
- [ ] Realtime chat works (test it in 2 tabs)
- [ ] Ready to develop!

---

## References

- [README.md](./README.md) — Project overview
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — Full architecture
- [docs/RUNBOOK.md](./docs/RUNBOOK.md) — Production procedures
- [CLAUDE.md](./CLAUDE.md) — Code instructions

---

**A problem not covered above?**

1. Search the logs: `docker compose logs -f`
2. Check ARCHITECTURE.md for context
3. Verify that `.env` is filled in
4. Try `make reset` if all else fails

**Setup complete!** You are ready to develop. Read CLAUDE.md for the project's conventions.
