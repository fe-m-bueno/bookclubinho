# DEPLOY — Bookclubinho em Vercel + Render

Guia completo para colocar o projeto em produção com:

- frontend no **Vercel**
- backend + worker + Postgres no **Render**
- Redis no **Upstash**
- storage no **Cloudflare R2**
- email no **Resend**
- OAuth no **Google Cloud**

Este guia assume o primeiro deploy usando os domínios padrão dos provedores:

- frontend: `https://<projeto>.vercel.app`
- backend: `https://<servico>.onrender.com`

Custom domain pode ser configurado depois, sem bloquear o primeiro deploy.

---

## 1. Contas Necessárias

Crie ou confirme acesso às contas abaixo:

1. **GitHub**
   - O repositório precisa estar acessível para Vercel e Render.
2. **Vercel**
   - Usado para o projeto Next.js em `frontend/`.
3. **Render**
   - Usado para API FastAPI, worker e Postgres.
4. **Upstash**
   - Usado para Redis TCP + REST.
5. **Cloudflare**
   - Usado para R2.
6. **Resend**
   - Usado para e-mails transacionais.
7. **Google Cloud**
   - Usado para OAuth Google.
8. **Hardcover**
   - Usado para busca e metadados de livros.
9. **Sentry** (opcional, mas recomendado)
   - Usado para erros e tracing.

---

## 2. Ordem Recomendada

Siga esta ordem:

1. Preparar credenciais dos provedores externos.
2. Definir o nome do projeto no Vercel que será usado no primeiro deploy.
3. Criar o backend no Render com o `render.yaml`, usando a URL planejada do Vercel em `APP_URL` e `ALLOWED_ORIGINS`.
4. Obter a URL pública do backend no Render.
5. Criar o frontend no Vercel apontando para `frontend/`.
6. Registrar URLs definitivas no Google, Resend e demais provedores.
7. Rodar checklist de validação final.

Não comece pelo Google OAuth. O callback depende da URL final do frontend no Vercel.

---

## 3. Preparar Credenciais Externas

### Upstash

1. Crie um database Redis no painel do Upstash.
2. Copie estes valores:
   - `REDIS_URL`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Em produção, `REDIS_URL` deve ser a URL TCP/TLS (`redis://` ou `rediss://`), não a REST URL.

### Cloudflare R2

1. No Cloudflare, abra **R2**.
2. Crie o bucket público usado pelo app.
   - Valor recomendado: `bookclub-public`
3. Gere um par de credenciais de API do R2.
4. Copie:
   - `S3_ENDPOINT`
   - `S3_ACCESS_KEY`
   - `S3_SECRET_KEY`
   - `S3_BUCKET_NAME`
5. Defina o hostname público dos assets:
   - Se usar domínio customizado do bucket, use esse host em `S3_PUBLIC_URL`
   - Se usar o hostname padrão do R2, use a URL pública correspondente e extraia o host para o Vercel

Exemplo:

- `S3_PUBLIC_URL=https://pub.seudominio.com`
- `NEXT_PUBLIC_R2_PUBLIC_HOSTNAME=pub.seudominio.com`

### Resend

1. Crie a conta.
2. Verifique o domínio remetente no painel da Resend.
3. Gere uma API key.
4. Copie:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`

Exemplo:

- `RESEND_FROM_EMAIL=noreply@seudominio.com`

### Google Cloud OAuth

1. Crie um projeto no Google Cloud.
2. Ative a API necessária para OAuth.
3. Vá em **APIs & Services > Credentials**.
4. Crie um **OAuth Client ID** do tipo Web application.
5. Deixe a edição final dos callbacks para depois que o Vercel estiver criado.
6. Guarde:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

### Hardcover

1. Acesse sua conta no Hardcover.
2. Gere o token da API GraphQL.
3. Guarde:
   - `HARDCOVER_API_TOKEN`

### Sentry (opcional)

1. Crie dois projetos, ou um projeto com DSNs separados conforme sua organização:
   - frontend
   - backend
2. Copie:
   - `SENTRY_DSN` para o backend
   - `NEXT_PUBLIC_SENTRY_DSN` para o frontend
3. Se quiser upload de source maps no Vercel, gere também:
   - `SENTRY_AUTH_TOKEN`

---

## 4. Deploy do Backend no Render

O repositório já inclui [`render.yaml`](/home/felipebueno/Development/bookclubinho/render.yaml). Ele define:

- `bookclub-postgres`
- `bookclub-api`
- `bookclub-worker`

### 4.1 Criar conta e conectar o GitHub

1. Entre no Render.
2. Conecte sua conta do GitHub.
3. Garanta que o Render tenha acesso ao repositório.

### 4.2 Criar os serviços pelo Blueprint

1. No Render, clique em **New > Blueprint**.
2. Selecione este repositório.
3. O Render deve detectar o arquivo `render.yaml`.
4. Revise os recursos que serão criados:
   - Postgres
   - Web service
   - Worker
5. Confirme a criação.

### 4.3 Preencher variáveis do backend

Durante a criação do Blueprint, o Render vai pedir os valores marcados com `sync: false`.

Preencha no serviço `bookclub-api`:

- `APP_URL`
  - Use a URL do Vercel, por exemplo `https://bookclubinho.vercel.app`
- `ALLOWED_ORIGINS`
  - Use a mesma URL do Vercel, sem barra final
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
- `SENTRY_DSN` opcional

Valores já definidos no `render.yaml`:

- `DATABASE_URL` vem do Postgres do Render
- `ENVIRONMENT=prod`
- `S3_BUCKET_NAME=bookclub-public`
- `HARDCOVER_API_URL=https://api.hardcover.app/v1/graphql`
- `WEB_CONCURRENCY=1`
- `JWT_SECRET` é gerado automaticamente

O worker herda os segredos principais do serviço web por `fromService`, então você não precisa duplicar o cadastro.

### 4.4 Esperar o primeiro deploy

1. Aguarde o Postgres ficar pronto.
2. Aguarde o deploy do `bookclub-api`.
3. Aguarde o deploy do `bookclub-worker`.
4. Abra a URL pública do backend no Render.

Valide:

```text
https://<seu-backend>.onrender.com/api/v1/health
```

O esperado é HTTP `200`.

### 4.5 Obter a URL pública do backend

Copie a URL pública do serviço `bookclub-api`.

Exemplo:

```text
https://bookclub-api.onrender.com
```

Ela será usada no Vercel como `NEXT_PUBLIC_API_URL`.

---

## 5. Deploy do Frontend no Vercel

### 5.1 Criar conta e conectar o GitHub

1. Entre no Vercel.
2. Conecte sua conta do GitHub.
3. Importe este repositório.

### 5.2 Configuração do projeto

Na criação do projeto:

1. Escolha o repositório correto.
2. Configure o **Root Directory** como:

```text
frontend
```

3. Mantenha os comandos padrão do Next.js, salvo se o Vercel sugerir algo diferente.

### 5.3 Variáveis de ambiente do Vercel

Cadastre em **Project Settings > Environment Variables**:

- `NEXT_PUBLIC_API_URL`
  - Valor: URL pública do backend Render
  - Exemplo: `https://bookclub-api.onrender.com`
- `NEXT_PUBLIC_R2_PUBLIC_HOSTNAME`
  - Valor: hostname público do bucket/CDN, sem protocolo
  - Exemplo: `pub.seudominio.com`
- `NEXT_PUBLIC_SENTRY_DSN`
  - Opcional
- `SENTRY_AUTH_TOKEN`
  - Opcional, apenas se quiser upload de source maps

Depois salve e faça o deploy.

### 5.4 Obter a URL pública do frontend

Após o primeiro deploy, copie a URL pública do Vercel.

Exemplo:

```text
https://bookclubinho.vercel.app
```

Essa URL é a origem pública principal do app. Os fluxos de autenticação no navegador usam esse domínio.

---

## 6. Registrar URLs nos Provedores

Depois que Render e Vercel estiverem no ar, volte aos provedores externos e finalize o cadastro.

### Google Cloud

No OAuth Client do Google:

1. Adicione em **Authorized JavaScript origins**:

```text
https://<seu-frontend>.vercel.app
```

2. Adicione em **Authorized redirect URIs**:

```text
https://<seu-frontend>.vercel.app/api/v1/auth/google/callback
```

Importante:

- o callback usa o domínio do **frontend**
- isso é intencional para que cookies e redirects permaneçam same-origin via Vercel rewrite

### Resend

1. Confirme que o domínio remetente está verificado.
2. Confirme que `RESEND_FROM_EMAIL` pertence a esse domínio.

### Cloudflare R2

1. Confirme que o bucket existe.
2. Confirme que a URL pública configurada em `S3_PUBLIC_URL` abre os assets públicos.
3. Confirme que o hostname cadastrado no Vercel (`NEXT_PUBLIC_R2_PUBLIC_HOSTNAME`) corresponde à mesma origem pública.

### Upstash

1. Confirme que a URL TCP foi usada em `REDIS_URL`.
2. Confirme que a REST URL/token foram usados em:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## 7. Conferência das Variáveis por Plataforma

### Render `bookclub-api`

Obrigatórias:

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

Opcionais:

- `SENTRY_DSN`
- `WEB_CONCURRENCY=1`

### Render `bookclub-worker`

Herda do `bookclub-api`:

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

Além disso:

- `DATABASE_URL` via Render Postgres
- `ENVIRONMENT=prod`

### Vercel

Obrigatórias:

- `NEXT_PUBLIC_API_URL=https://<backend>.onrender.com`
- `NEXT_PUBLIC_R2_PUBLIC_HOSTNAME=<host-publico-do-r2>`

Opcionais:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`

---

## 8. Smoke Test de Produção

Faça estes testes nesta ordem.

### Infra

1. Backend health:
   - `GET https://<backend>.onrender.com/api/v1/health`
2. Verifique logs do `bookclub-api` no Render.
3. Verifique logs do `bookclub-worker` no Render.

### Auth

1. Abrir `https://<frontend>.vercel.app`
2. Criar conta
3. Fazer login com e-mail e senha
4. Fazer logout
5. Solicitar magic link
6. Testar login com Google

### Worker

1. Confirmar no health que `notification_worker` aparece
2. Confirmar que emails de teste saem pela Resend

### Upload e assets

1. Subir avatar
2. Confirmar que a imagem abre pela origem pública do R2
3. Confirmar que o frontend não bloqueia a imagem por CSP

### Chat e realtime

1. Abrir um grupo em duas sessões
2. Enviar mensagem
3. Confirmar atualização em tempo real
4. Confirmar que não há erro de EventSource/cookies no navegador

---

## 9. Onde Configurar Cada Coisa

### Render

- `Blueprint`: cria backend, worker e Postgres
- `Environment`: backend secrets
- `Logs`: investigar falhas de startup, migration e worker
- `Postgres > Backups`: restore e manutenção

### Vercel

- `Project > Settings > General`
  - `Root Directory = frontend`
- `Project > Settings > Environment Variables`
  - variáveis do Next.js
- `Project > Domains`
  - custom domain, se quiser adicionar depois

### Google Cloud

- `APIs & Services > Credentials`
  - client OAuth
  - origins e redirect URIs

### Resend

- `Domains`
  - verificação do domínio remetente
- `API Keys`
  - geração e rotação da chave

### Cloudflare

- `R2`
  - bucket
  - API tokens
  - domínio público opcional

### Upstash

- `Redis`
  - TCP URL
  - REST URL/token

---

## 10. Custom Domain Depois do Primeiro Deploy

Se quiser domínio próprio depois:

1. Adicione o domínio no Vercel.
2. Atualize DNS no seu provedor.
3. Quando o domínio estiver ativo, atualize:
   - `APP_URL` no Render
   - `ALLOWED_ORIGINS` no Render
   - Google OAuth origins/redirect URIs
   - `RESEND_FROM_EMAIL` se trocar o domínio remetente
4. Faça novo deploy.

Se também quiser domínio próprio para o backend:

1. Adicione o domínio no Render.
2. Atualize `NEXT_PUBLIC_API_URL` no Vercel.
3. Faça novo deploy do frontend.

Isso não é necessário para o primeiro deploy funcional.

---

## 11. Troubleshooting Rápido

### `/api/v1/health` retorna 503

Verifique no Render:

- `DATABASE_URL`
- `REDIS_URL`
- `S3_*`
- logs do `bookclub-api`

### Google OAuth volta com erro

Quase sempre é um destes:

- `APP_URL` incorreta no Render
- redirect URI incorreta no Google Cloud
- `ALLOWED_ORIGINS` diferente da URL do Vercel

### Login funciona, mas chat em tempo real não

Verifique:

- `REDIS_URL` TCP correta
- worker ativo
- logs do backend para EventSource/SSE

### Upload falha ou imagem não abre

Verifique:

- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_PUBLIC_URL`
- `NEXT_PUBLIC_R2_PUBLIC_HOSTNAME`

---

## 12. Arquivos do Repositório Relacionados ao Deploy

- [`render.yaml`](/home/felipebueno/Development/bookclubinho/render.yaml)
- [`backend/Dockerfile`](/home/felipebueno/Development/bookclubinho/backend/Dockerfile)
- [`backend/.env.example`](/home/felipebueno/Development/bookclubinho/backend/.env.example)
- [`frontend/next.config.ts`](/home/felipebueno/Development/bookclubinho/frontend/next.config.ts)
- [`docs/RUNBOOK.md`](/home/felipebueno/Development/bookclubinho/docs/RUNBOOK.md)

Se este guia estiver desatualizado, ajuste primeiro o código e o `render.yaml`, depois atualize este documento.
