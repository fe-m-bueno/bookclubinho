# DEPLOY — Bookclubinho on Vercel + Render

A complete guide to putting the project into production with:

- the frontend on **Vercel**
- the backend + worker + Postgres on **Render**
- Redis on **Upstash**
- storage on **Cloudflare R2**
- email on **Resend**
- OAuth on **Google Cloud**

This guide assumes a first deploy using the providers' default domains:

- frontend: `https://<project>.vercel.app`
- backend: `https://<service>.onrender.com`

A custom domain can be set up later, without blocking the first deploy.

---

## 1. Accounts You Need

Create or confirm access to the accounts below:

1. **GitHub**
   - The repository has to be accessible to Vercel and Render.
2. **Vercel**
   - Used for the Next.js project in `frontend/`.
3. **Render**
   - Used for the FastAPI API, the worker, and Postgres.
4. **Upstash**
   - Used for Redis TCP + REST.
5. **Cloudflare**
   - Used for R2.
6. **Resend**
   - Used for transactional email.
7. **Google Cloud**
   - Used for Google OAuth.
8. **Hardcover**
   - Used for book search and metadata.
9. **Sentry** (optional, but recommended)
   - Used for errors and tracing.

---

## 2. Recommended Order

Follow this order:

1. Prepare the external providers' credentials.
2. Decide the Vercel project name that the first deploy will use.
3. Create the backend on Render with `render.yaml`, using the planned Vercel URL in `APP_URL` and `ALLOWED_ORIGINS`.
4. Get the backend's public URL on Render.
5. Create the frontend on Vercel, pointing at `frontend/`.
6. Register the final URLs with Google, Resend, and the other providers.
7. Run the final validation checklist.

Don't start with Google OAuth. The callback depends on the frontend's final URL on Vercel.

---

## 3. Preparing the External Credentials

### Upstash

1. Create a Redis database in the Upstash dashboard.
2. Copy these values:
   - `REDIS_URL`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. In production, `REDIS_URL` must be the TCP/TLS URL (`redis://` or `rediss://`), not the REST URL.

### Cloudflare R2

1. In Cloudflare, open **R2**.
2. Create the public bucket the app uses.
   - Recommended value: `bookclub-public`
3. Generate an R2 API credential pair.
4. Copy:
   - `S3_ENDPOINT`
   - `S3_ACCESS_KEY`
   - `S3_SECRET_KEY`
   - `S3_BUCKET_NAME`
5. Set the assets' public hostname:
   - If you use a custom bucket domain, use that host in `S3_PUBLIC_URL`
   - If you use R2's default hostname, use the corresponding public URL and extract the host for Vercel

Example:

- `S3_PUBLIC_URL=https://pub.yourdomain.com`
- `NEXT_PUBLIC_R2_PUBLIC_HOSTNAME=pub.yourdomain.com`

### Resend

1. Create the account.
2. Verify the sender domain in the Resend dashboard.
3. Generate an API key.
4. Copy:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`

Example:

- `RESEND_FROM_EMAIL=noreply@yourdomain.com`

### Google Cloud OAuth

1. Create a project in Google Cloud.
2. Enable the API needed for OAuth.
3. Go to **APIs & Services > Credentials**.
4. Create an **OAuth Client ID** of type Web application.
5. Leave the final callback editing for after Vercel is set up.
6. Save:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

### Hardcover

1. Open your Hardcover account.
2. Generate the GraphQL API token.
3. Save:
   - `HARDCOVER_API_TOKEN`

### Sentry (optional)

1. Create two projects, or one project with separate DSNs, depending on your organization:
   - frontend
   - backend
2. Copy:
   - `SENTRY_DSN` for the backend
   - `NEXT_PUBLIC_SENTRY_DSN` for the frontend
3. If you want source map uploads on Vercel, also generate:
   - `SENTRY_AUTH_TOKEN`

---

## 4. Deploying the Backend on Render

The repository already includes [`render.yaml`](/home/felipebueno/Development/bookclubinho/render.yaml). It defines:

- `bookclub-postgres`
- `bookclub-api`
- `bookclub-worker`

### 4.1 Create an Account and Connect GitHub

1. Sign in to Render.
2. Connect your GitHub account.
3. Make sure Render has access to the repository.

### 4.2 Create the Services via the Blueprint

1. In Render, click **New > Blueprint**.
2. Select this repository.
3. Render should detect the `render.yaml` file.
4. Review the resources it will create:
   - Postgres
   - Web service
   - Worker
5. Confirm the creation.

### 4.3 Fill In the Backend Variables

While the Blueprint is being created, Render will ask for the values marked `sync: false`.

Fill these in on the `bookclub-api` service:

- `APP_URL`
  - Use the Vercel URL, for example `https://bookclubinho.vercel.app`
- `ALLOWED_ORIGINS`
  - Use the same Vercel URL, without a trailing slash
- `REDIS_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_PUBLIC_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `HARDCOVER_API_TOKEN`
- `SENTRY_DSN` (optional)

Values already set in `render.yaml`:

- `DATABASE_URL` comes from Render's Postgres
- `ENVIRONMENT=prod`
- `S3_BUCKET_NAME=bookclub-public`
- `HARDCOVER_API_URL=https://api.hardcover.app/v1/graphql`
- `WEB_CONCURRENCY=1`
- `JWT_SECRET` is generated automatically

The worker inherits the main secrets from the web service via `fromService`, so you don't have to enter them twice.

### 4.4 Wait for the First Deploy

1. Wait for Postgres to be ready.
2. Wait for the `bookclub-api` deploy.
3. Wait for the `bookclub-worker` deploy.
4. Open the backend's public URL on Render.

Validate:

```text
https://<your-backend>.onrender.com/api/v1/health
```

You should get HTTP `200`.

### 4.5 Get the Backend's Public URL

Copy the public URL of the `bookclub-api` service.

Example:

```text
https://bookclub-api.onrender.com
```

It will be used on Vercel as `NEXT_PUBLIC_API_URL`.

---

## 5. Deploying the Frontend on Vercel

### 5.1 Create an Account and Connect GitHub

1. Sign in to Vercel.
2. Connect your GitHub account.
3. Import this repository.

### 5.2 Project Configuration

While creating the project:

1. Choose the right repository.
2. Set the **Root Directory** to:

```text
frontend
```

3. Keep Next.js's default commands, unless Vercel suggests otherwise.

### 5.3 Vercel Environment Variables

Register these under **Project Settings > Environment Variables**:

- `NEXT_PUBLIC_API_URL`
  - Value: the Render backend's public URL
  - Example: `https://bookclub-api.onrender.com`
- `NEXT_PUBLIC_R2_PUBLIC_HOSTNAME`
  - Value: the bucket/CDN's public hostname, without a protocol
  - Example: `pub.yourdomain.com`
- `NEXT_PUBLIC_SENTRY_DSN`
  - Optional
- `SENTRY_AUTH_TOKEN`
  - Optional, only if you want source map uploads

Then save and deploy.

### 5.4 Get the Frontend's Public URL

After the first deploy, copy the public Vercel URL.

Example:

```text
https://bookclubinho.vercel.app
```

That URL is the app's main public origin. The browser authentication flows use that domain.

---

## 6. Registering the URLs with the Providers

Once Render and Vercel are live, go back to the external providers and finish the setup.

### Google Cloud

In Google's OAuth Client:

1. Add under **Authorized JavaScript origins**:

```text
https://<your-frontend>.vercel.app
```

2. Add under **Authorized redirect URIs**:

```text
https://<your-frontend>.vercel.app/api/v1/auth/google/callback
```

Important:

- the callback uses the **frontend's** domain
- this is intentional, so that cookies and redirects stay same-origin via the Vercel rewrite

### Resend

1. Confirm that the sender domain is verified.
2. Confirm that `RESEND_FROM_EMAIL` belongs to that domain.

### Cloudflare R2

1. Confirm that the bucket exists.
2. Confirm that the public URL configured in `S3_PUBLIC_URL` serves the public assets.
3. Confirm that the hostname registered on Vercel (`NEXT_PUBLIC_R2_PUBLIC_HOSTNAME`) matches that same public origin.

### Upstash

1. Confirm that the TCP URL was used for `REDIS_URL`.
2. Confirm that the REST URL/token were used for:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## 7. Variable Checklist by Platform

### Render `bookclub-api`

Required:

- `DATABASE_URL` via Render Postgres
- `ENVIRONMENT=prod`
- `APP_URL=https://<frontend>.vercel.app`
- `ALLOWED_ORIGINS=https://<frontend>.vercel.app`
- `REDIS_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET_NAME=bookclub-public`
- `S3_PUBLIC_URL`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `HARDCOVER_API_URL=https://api.hardcover.app/v1/graphql`
- `HARDCOVER_API_TOKEN`

Optional:

- `SENTRY_DSN`
- `WEB_CONCURRENCY=1`

### Render `bookclub-worker`

Inherited from `bookclub-api`:

- `APP_URL`
- `REDIS_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `S3_*`
- `JWT_SECRET`
- `GOOGLE_*`
- `RESEND_*`
- `HARDCOVER_*`
- `SENTRY_DSN`

Plus:

- `DATABASE_URL` via Render Postgres
- `ENVIRONMENT=prod`

### Vercel

Required:

- `NEXT_PUBLIC_API_URL=https://<backend>.onrender.com`
- `NEXT_PUBLIC_R2_PUBLIC_HOSTNAME=<r2-public-host>`

Optional:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`

---

## 8. Production Smoke Test

Run these tests in this order.

### Infrastructure

1. Backend health:
   - `GET https://<backend>.onrender.com/api/v1/health`
2. Check the `bookclub-api` logs on Render.
3. Check the `bookclub-worker` logs on Render.

### Auth

1. Open `https://<frontend>.vercel.app`
2. Create an account
3. Log in with email and password
4. Log out
5. Request a magic link
6. Test login with Google

### Worker

1. Confirm that `notification_worker` shows up in the health check
2. Confirm that test emails go out through Resend

### Uploads and Assets

1. Upload an avatar
2. Confirm that the image loads from R2's public origin
3. Confirm that the frontend doesn't block the image via CSP

### Chat and Realtime

1. Open a group in two sessions
2. Send a message
3. Confirm the realtime update
4. Confirm there is no EventSource/cookie error in the browser

---

## 9. Where to Configure Each Thing

### Render

- `Blueprint`: creates the backend, worker, and Postgres
- `Environment`: backend secrets
- `Logs`: investigate startup, migration, and worker failures
- `Postgres > Backups`: restore and maintenance

### Vercel

- `Project > Settings > General`
  - `Root Directory = frontend`
- `Project > Settings > Environment Variables`
  - Next.js variables
- `Project > Domains`
  - custom domain, if you want to add one later

### Google Cloud

- `APIs & Services > Credentials`
  - the OAuth client
  - origins and redirect URIs

### Resend

- `Domains`
  - sender domain verification
- `API Keys`
  - key generation and rotation

### Cloudflare

- `R2`
  - bucket
  - API tokens
  - optional public domain

### Upstash

- `Redis`
  - TCP URL
  - REST URL/token

---

## 10. A Custom Domain After the First Deploy

If you want your own domain later:

1. Add the domain in Vercel.
2. Update DNS at your provider.
3. Once the domain is live, update:
   - `APP_URL` on Render
   - `ALLOWED_ORIGINS` on Render
   - the Google OAuth origins/redirect URIs
   - `RESEND_FROM_EMAIL`, if you change the sender domain
4. Deploy again.

If you also want your own domain for the backend:

1. Add the domain in Render.
2. Update `NEXT_PUBLIC_API_URL` on Vercel.
3. Deploy the frontend again.

None of this is required for a working first deploy.

---

## 11. Quick Troubleshooting

### `/api/v1/health` returns 503

Check on Render:

- `DATABASE_URL`
- `REDIS_URL`
- `S3_*`
- the `bookclub-api` logs

### Google OAuth comes back with an error

It is almost always one of these:

- the wrong `APP_URL` on Render
- the wrong redirect URI in Google Cloud
- `ALLOWED_ORIGINS` differing from the Vercel URL

### Login works, but realtime chat doesn't

Check:

- that `REDIS_URL` is the correct TCP URL
- that the worker is running
- the backend logs for EventSource/SSE

### Uploads fail or the image won't load

Check:

- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_PUBLIC_URL`
- `NEXT_PUBLIC_R2_PUBLIC_HOSTNAME`

---

## 12. Deploy-Related Files in the Repository

- [`render.yaml`](/home/felipebueno/Development/bookclubinho/render.yaml)
- [`backend/Dockerfile`](/home/felipebueno/Development/bookclubinho/backend/Dockerfile)
- [`backend/.env.example`](/home/felipebueno/Development/bookclubinho/backend/.env.example)
- [`frontend/next.config.ts`](/home/felipebueno/Development/bookclubinho/frontend/next.config.ts)
- [`docs/RUNBOOK.md`](/home/felipebueno/Development/bookclubinho/docs/RUNBOOK.md)

If this guide is out of date, fix the code and `render.yaml` first, then update this document.
