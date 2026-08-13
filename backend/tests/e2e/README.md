# E2E against a real backend and Postgres

These tests exist because the unit tests mock out the entire `db`, and three bugs
slipped underneath them:

- **#215** — the response went out before the commit, so the BackgroundTasks ran
  first and the badge checker, with its own session, never saw the new rows.
  Almost no badges were granted, silently.
- **#212** — `register` returned a 500 when the email send failed, after it had
  already committed the account.
- **#214** — `_user_display` was infinite recursion: five notification emails
  never went out.

None of them is reachable without a real database.

## Running

Start the local infrastructure (`infra/docker-compose.yml` has the same images;
with podman and no compose provider, run them directly):

```bash
podman run -d --name bookclub-pg \
  -e POSTGRES_USER=bookclub -e POSTGRES_PASSWORD=bookclub -e POSTGRES_DB=bookclub \
  -p 5432:5432 docker.io/library/postgres:16-alpine
podman run -d --name bookclub-redis -p 6379:6379 docker.io/library/redis:7-alpine
```

A `.env` pointing at them — copy yours and change two lines:

```
DATABASE_URL=postgresql://bookclub:bookclub@localhost:5432/bookclub
REDIS_URL=redis://localhost:6379/0
ALLOWED_ORIGINS=http://localhost:3000
ENVIRONMENT=dev
```

`ENVIRONMENT=dev` matters: `cookies.py` derives `secure` from `DEBUG`, and with
`secure=True` the auth cookies are dropped over `http://localhost`.

Migrations and the server:

```bash
set -a && source .env.e2e && set +a
alembic upgrade head
uvicorn main:app --port 8010
```

And then:

```bash
E2E_API_URL=http://localhost:8010/api/v1 \
E2E_DSN=postgresql://bookclub:bookclub@localhost:5432/bookclub \
  python tests/e2e/round_lifecycle.py
```

Expected output: `30 passaram, 0 falharam`.

## Two things that will bite you

**Rate limiting.** Several endpoints are `30/minute` or less, per IP. Running the
script back to back exhausts the limit, and the 429s show up as confusing
failures. Between runs: `podman exec bookclub-redis redis-cli FLUSHALL`.

**Users are seeded straight into the database**, with `email_verified=true`,
instead of going through `POST /auth/register`. Two reasons: Resend rejects test
domains, and register returns a 500 when the email fails (#212). Once #212 is
fixed, it is worth switching to real registration — that path would then be
covered.

## Database state

The script does not clean up after itself. For a clean run:

```bash
podman exec bookclub-pg psql -U bookclub -d bookclub -c "
TRUNCATE user_badges, reading_progress, book_reviews, round_votes,
         round_nominations, rounds, group_messages, group_members,
         groups, users CASCADE;"
```

Never point this at the production database.

## media_key_backfill.py

Verifies migration 0023's backfill. It needs a **disposable** database — it
writes to `group_messages`, and the DSN's name has to contain `_mig` (or
`E2E_ALLOW_ANY_DB=1`, if you know what you're doing).

Two passes, because the state to check is the one the migration left behind:

```bash
export PGPASSWORD=bookclub
createdb -h 127.0.0.1 -U bookclub bookclub_mig
D=postgresql://bookclub:bookclub@localhost:5432/bookclub_mig

alembic upgrade 0022                                    # the previous schema
E2E_DSN=$D python tests/e2e/media_key_backfill.py       # plants the 4 cases
alembic upgrade head                                    # runs the backfill
VERIFICAR=1 E2E_DSN=$D python tests/e2e/media_key_backfill.py
```

Expected output: `8 passaram, 0 falharam`. With the original backfill (the
`'media/[^?]+'` pattern, without the `group_id`), you get
`4 passaram, 4 falharam` — which is what the script exists to catch.
