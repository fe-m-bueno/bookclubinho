# RUNBOOK — Bookclubinho

Operational procedures for credential rotation, incident response, and recovery.

---

## Credential Rotation

### JWT_SECRET

**When to rotate:** every 90 days, or immediately after a suspected leak.

**Impact:** every active access and refresh token is invalidated. Users will have to log in again.

**Steps:**
1. Generate a new secret: `openssl rand -hex 64`
2. In Render, update the `JWT_SECRET` variable on the `bookclub-api` service.
3. Confirm that the `bookclub-worker` worker inherits the same value via `fromService`.
3. Deploy the backend.
4. Invalidate every active session via SQL:
   ```sql
   DELETE FROM user_sessions;
   ```
5. Watch Sentry for authentication errors over the following 15 minutes.

---

### S3 / Cloudflare R2 (Access Key + Secret)

**When to rotate:** every 90 days, or after offboarding a developer with access.

**Steps:**
1. In the Cloudflare R2 dashboard, create a new API key pair.
2. Update `S3_ACCESS_KEY` and `S3_SECRET_KEY` in Render.
3. Deploy.
4. Verify avatar uploads in staging.
5. Revoke the old keys in the Cloudflare dashboard.

---

### Resend API Key

**When to rotate:** every 90 days, or after suspected misuse.

**Steps:**
1. In the Resend dashboard, create a new API key with the same scopes.
2. Update `RESEND_API_KEY` in Render.
3. Deploy.
4. Send a test email via `/api/v1/auth/magic-link`.
5. Revoke the old key in the Resend dashboard.

---

### Google OAuth (Client Secret)

**When to rotate:** after a suspected compromise, or when Google requires it.

**Steps:**
1. In the Google Cloud Console, generate a new Client Secret for the OAuth App.
2. Update `GOOGLE_CLIENT_SECRET` in Render and confirm that `APP_URL`/`ALLOWED_ORIGINS` still point at the Vercel domain.
3. Deploy the backend and the frontend.
4. Test the full OAuth flow in staging.
5. Revoke the old secret in the Google Cloud Console.

---

### Sentry DSN

**When to rotate:** after suspected unauthorized use, or after offboarding.

**Steps:**
1. In the Sentry dashboard, create a new DSN for the project.
2. Update `SENTRY_DSN` (backend) in Render and `NEXT_PUBLIC_SENTRY_DSN` (frontend) in Vercel.
3. Deploy.
4. Force a test error to confirm the events reach Sentry.
5. Revoke the old DSN in Sentry.

---

## Incident Procedures

### Suspected Compromised Account

1. Revoke all of the user's sessions:
   ```sql
   DELETE FROM user_sessions WHERE user_id = '<user_id>';
   ```
2. Force a password reset via magic link.
3. Check `audit_log` for suspicious activity:
   ```sql
   SELECT action, ip_hash, user_agent, created_at
   FROM audit_log
   WHERE user_id = '<user_id>'
   ORDER BY created_at DESC
   LIMIT 50;
   ```

### Brute Force in Progress

1. Check Redis:
   ```
   redis-cli keys "login_fail:*" | head -20
   redis-cli keys "login_lock:*" | head -20
   ```
2. If the attack is large-scale, raise `_LOGIN_MAX_FAILS` via a feature flag (code change + deploy).
3. Block the IP at the Render or Cloudflare level.

### Chat Spam / Flooding

1. Check Redis for flood keys:
   ```
   redis-cli keys "chat_flood:*" | head -20
   ```
2. Ban the user via admin (revoke membership + Redis blacklist).
3. Review `message_reports` for abuse patterns:
   ```sql
   SELECT reported_user_id, count(*) as report_count
   FROM message_reports
   WHERE created_at > now() - interval '24 hours'
   GROUP BY reported_user_id
   ORDER BY report_count DESC;
   ```

### Secret Leak

1. Immediately rotate the affected credential (see the sections above).
2. Audit the Render, Vercel, and Cloudflare access logs for misuse.
3. Notify affected users if data was exposed (an LGPD obligation).
4. Revoke every user token as a precaution.

---

## Database Recovery

### Restoring a Backup (Neon)

1. Open the Neon dashboard → the project → Branches / Restore.
2. Select the restore point (Neon does point-in-time per branch).
3. Restore to a **new branch** first, to validate without touching the current one.
4. Update `DATABASE_URL` (and `DATABASE_APP_URL`, if it is in use) to point at the
   restored branch's endpoint.
5. Run `alembic upgrade head` to make sure the migrations are in sync.
6. If `DATABASE_APP_URL` is in use, the `bookclub_app` role has to exist on the
   restored branch with the same `GRANT`s — the role and its privileges follow the
   branch, but check before pointing the service at it.

---

## RLS: turning it on for real

**Current state: RLS is not in effect in production.** The app connects with a
superuser role, and a superuser does not evaluate policies — not even with
`FORCE ROW LEVEL SECURITY`. The policies from migration 0005 onward are, today,
executable documentation.

Migrations 0025–0027 fixed the five defects that prevented the switch, and the
full flow was verified on a Postgres 16 with the app running as a role without
`BYPASSRLS` and without ownership of the tables: registration, login, an
authenticated route, group creation, member list, chat, stats, and token
creation/use/revocation.

What remains is **a configuration step**: pointing the service's `DATABASE_URL`
at a restricted role. Until that happens, none of this has any effect — whoever
bypasses RLS sees no policy at all.

### The five defects, all verified under an ordinary role

1. **Queries that establish identity.** Login, registration, magic link, OAuth,
   refresh, and Bearer resolution read `users`/`user_sessions`/
   `personal_access_tokens` before `app.current_user_id` exists. Without a gate,
   login answers "invalid credentials" for everyone. The named gate:
   `app.auth_lookup` (0025).
2. **`current_setting` becomes `''`, not NULL.** Once a `set_config(..., true)`
   ends, the GUC holds an empty string. On a pooled connection, `''::uuid`
   **raises an error** and aborts the transaction. There were 63 policies across
   20 tables; 0026 rewrote them all with `nullif(...)`.
3. **`INSERT ... RETURNING` is checked against the SELECT policy**, not the
   INSERT one. Every `login_failed` and `register` disappeared from `audit_log`
   silently, because `log_event` swallows its own error (0025).
4. **A commit mid-request cleared the context.** `set_config(..., true)` dies at
   commit, and `register_user` commits before `log_event`. Fixed with an
   `after_begin` hook that reapplies the context on every new transaction
   (`app/db/engine.py` + `rls.reapply_context_on_new_transaction`).

6. **`groups` was readable by any authenticated user** (0028). `groups_select`
   said `is_active AND current_setting('app.current_user_id') != ''` — meaning
   any logged-in user could read **any** active group. And RLS filters rows, not
   columns, so that included `invite_code`, which is the credential for joining.
   It was the only table where turning RLS on added nothing. Measured on the
   validation branch: before, an unaffiliated user read all 3 groups; after, 0.

5. **Recursive policies** (0027). `group_members_select/update/delete` asked "are
   you in this group?" by reading `group_members` from inside the `group_members`
   policy — `infinite recursion detected in policy`, a hard error. Since 31
   policies on other tables check membership the same way, they went down with
   it: group, chat, round, review, and meeting. The question was moved out into
   two `SECURITY DEFINER` functions (`app_is_group_member`, `app_is_group_admin`).

### The `NO FORCE` on `group_members`, and why it loosens nothing

`FORCE ROW LEVEL SECURITY` applies the policies **to the table owner as well**.
With it on, the `SECURITY DEFINER` function stays trapped and returns `false`
silently — denying access to people who are entitled to it. That is why 0027
turns `FORCE` off on that table, and **only** on that table.

This loosens nothing for the application, and the reason is simple: **a role that
is not the owner is subject to RLS always, with or without `FORCE`.** Measured in
the verification environment, with the app on a non-owner role:

| context | `group_members` | `group_messages` | `personal_access_tokens` |
|---|---|---|---|
| no user | 0 | 0 | 0 |
| group member | 1 | 1 | 1 |
| unrelated user | 0 | 0 | 0 |

The only scenario `FORCE` covered is the app connecting **as the table owner** —
exactly what the role separation eliminates. If the app ever goes back to
connecting as the owner, this reasoning stops holding.

Nothing here **creates** a role with `BYPASSRLS`. On Neon, `neondb_owner` already
has it, and that is what makes it right for migrations and wrong for the app.

A good consequence of this: since the `SECURITY DEFINER` function is created by
the migrations, it belongs to `neondb_owner` and inherits its `BYPASSRLS` — so on
Neon, 0027's `NO FORCE` never even has to kick in. It stays as a portability
guarantee: if the table owner ever lacks `BYPASSRLS`, the function keeps working.

### Migrations still need a privileged role

Two independent reasons:

- `alembic upgrade head` creates and alters policies. The app must not be able to
  do that.
- Adding an FK to `group_members` triggers a validation that evaluates policies.
  On an owner **without** `BYPASSRLS` and with `FORCE`, this fails — which is
  what happened in the verification environment. It does not show up on Neon,
  because `neondb_owner` has `BYPASSRLS`.

On Render this is already separated in practice: `alembic upgrade head` runs in
the pre-deploy step, and that is what reads `DATABASE_URL`. The app reads
`DATABASE_APP_URL` when it exists.

### The switchover procedure (Neon)

The database is **Neon**; the backend runs on Render. `neondb_owner` is the
privileged role and **has `BYPASSRLS`** — which is why the policies don't apply
to it, and why it is right for migrations and wrong for the app.

> **Mandatory ordering:** the restricted role only works after migrations
> 0024–0028 have run. Setting `DATABASE_APP_URL` before that takes the app down —
> the old policies have the six defects above, and login stops working. Deploy
> first (the pre-deploy runs `alembic upgrade head`), then set the variable.

**1. Create the restricted role.** Run this in Neon's SQL Editor, connected as
`neondb_owner`:

```sql
CREATE ROLE bookclub_app WITH LOGIN PASSWORD '...';

GRANT CONNECT ON DATABASE neondb TO bookclub_app;
GRANT USAGE ON SCHEMA public TO bookclub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bookclub_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bookclub_app;

-- For tables that future migrations create. This has to be run by
-- `neondb_owner`: `ALTER DEFAULT PRIVILEGES` applies to objects created by the
-- role that ran the command, and it is the one that runs the migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bookclub_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bookclub_app;
```

Note what is **not** there: no `SUPERUSER`, no `BYPASSRLS`, no table ownership.
That is what makes the policies apply to it. A role created via SQL on Neon also
does not join `neon_superuser` — roles created through the Console, API, or CLI
do, so create it via SQL.

**2. Set `DATABASE_APP_URL` on the Render service.** That's all. `DATABASE_URL`
stays on `neondb_owner`, because that is what the pre-deploy's
`alembic upgrade head` uses; the app starts preferring `DATABASE_APP_URL`
whenever it exists (`app/db/engine.py`).

```
DATABASE_URL      = postgresql://neondb_owner:...@ep-....neon.tech/neondb   # migrations
DATABASE_APP_URL  = postgresql://bookclub_app:...@ep-....neon.tech/neondb   # app
```

Use the **pooler** endpoint for the app's URL and the **direct** one (without
`-pooler`) for the migration URL — DDL does not benefit from the pooler, and some
operations behave badly with it.

**3. Verify.** This should return `f`, `f`:

```sql
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'bookclub_app';
```

Then the smoke test: log in, open a group, send a message. If login fails with
"invalid credentials" for a correct password, the symptom is RLS blocking the
lookup by email — check that 0025–0027 ran.

**Rollback:** remove the `DATABASE_APP_URL` variable and restart. The app falls
back to `DATABASE_URL` and nothing else changes.

### Why the pooler makes this more urgent, not less

The app's URL uses Neon's pooler endpoint, which is PgBouncer in transaction
mode: one server connection is reused across requests from **different users**.

Two consequences, both already handled in the code:

- The user context **has** to be transaction-local (`set_config(..., true)`). If
  it were session-scoped, one user's `app.current_user_id` would leak into the
  next request on the same server connection — an identity swap, not just a read
  leak.
- Defect #2 above (the GUC becoming `''` after the transaction) stops being
  occasional and becomes the common case, because the server connection is always
  reused. Without 0026's `nullif`, it would be a database error on nearly every
  request with no user in the context.

**Rollback:** point `DATABASE_URL` back at the previous role. No migration needs
reverting; the corrected policies are inert for anyone who bypasses RLS. The
rollback is immediate and loses no data.

### Not yet covered — read before switching

The verification ran on a **Neon branch** created from production, with real
data, the pooler endpoint, and the app on the `bookclub_app` role. It covered:
registration, login, an authenticated route, group creation, member list, chat,
stats, token create/use/revoke, joining via invite code, and isolation between
two users. All green. The branch was deleted.

What was **not** exercised, and where I would expect trouble:

- **`populate_shelf_cache`** (`app/services/shelf.py`) — a background task, running
  with no user in the context. Reading the group is already covered by 0028's
  gate, but `_build_shelf_data` right afterward reads `rounds` and `book_reviews`,
  whose policies are keyed on membership. Under a restricted role that fails, the
  job's `except Exception` swallows it, and the public shelf simply stops
  updating. **This is the most concrete pending item**: silent degradation, not a
  visible error.
- **Workers** (`app/workers/`) — the same pattern: their own session, no user.
- **Chat SSE**, **data export**, and **the annual wrapped** — they use the same
  sessions and policies as the tested paths, but they did not go through the
  smoke test.

Recommendation: after setting `DATABASE_APP_URL`, exercise each of those once and
check the log. The rollback is removing the variable.

---

## Production Deploy Checklist

- [ ] `alembic upgrade head` ran without errors
- [ ] The required environment variables are present (see `app/core/config.py`)
- [ ] Sentry is receiving test events
- [ ] The `/api/v1/health` health check returns 200
- [ ] The Google OAuth login test works
- [ ] Avatar upload works (validates R2 + presigned URL)
