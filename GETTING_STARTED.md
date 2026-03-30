# Guia de Setup Local — Bookclubinho

Instruções completas para rodar o projeto localmente no seu computador. Leia este guia completamente antes de começar.

**Tempo estimado:** 15-20 minutos (primeira vez)

---

## Pré-requisitos

Antes de começar, certifique-se de ter instalado:

### Obrigatório

- **Node.js** 18+ (verificar com `node --version`)
- **npm** ou **yarn** (vem com Node.js)
- **Python** 3.12+ (verificar com `python --version` ou `python3 --version`)
- **Docker Desktop** (incluindo Docker Compose)
  - Linux: instale Docker e Docker Compose separadamente
  - macOS/Windows: Docker Desktop já inclui Compose
- **Git** (para clonar o repositório)

### Opcional para desenvolvimento

- **PostgreSQL GUI** (pgAdmin, DBeaver) para inspecionar banco
- **Redis GUI** (Redis Insight) para inspecionar cache
- **VSCode Extensions:**
  - ESLint
  - Ruff (Python)
  - SQLAlchemy ORM (autocomplete)
  - Tailwind CSS IntelliSense

### Verificar instalação

```bash
node --version        # Node.js
npm --version         # npm
python --version      # Python 3.12+
docker --version      # Docker
docker compose --version  # Docker Compose
git --version         # Git
```

---

## 1. Clonar e Instalar Dependências

### Frontend

```bash
# Na raiz do projeto
cd frontend
npm install
```

**O que acontece:**
- Baixa todas as dependências do `package.json` (Next.js, React, Tailwind, etc.)
- Cria a pasta `node_modules/`
- Gera `package-lock.json` (se não existir)

**Tempo esperado:** 2-3 minutos

### Backend

```bash
# Na raiz do projeto
cd backend

# Criar virtual environment (RECOMENDADO)
python -m venv venv

# Ativar virtual environment
# No Linux/macOS:
source venv/bin/activate

# No Windows (PowerShell):
./venv/Scripts/Activate.ps1

# No Windows (CMD):
.\venv\Scripts\activate.bat

# Instalar dependências
pip install -r requirements.txt
```

**O que acontece:**
- Cria ambiente Python isolado (venv)
- Instala FastAPI, SQLAlchemy, Pydantic, etc.
- Gera `site-packages/`

**Tempo esperado:** 3-5 minutos

---

## 2. Configurar Variáveis de Ambiente

### Frontend (`.env.local`)

Crie o arquivo `/frontend/.env.local`:

```bash
cd frontend
cat > .env.local << 'EOF'
# API do Backend
NEXT_PUBLIC_API_URL=http://localhost:8000

# Google OAuth (opcional para desenvolvimento local)
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=seu_google_client_id

# Sentry (opcional)
# NEXT_PUBLIC_SENTRY_DSN=seu_sentry_dsn
EOF
```

**Variáveis obrigatórias:**
- `NEXT_PUBLIC_API_URL` — URL do backend (deve ser http://localhost:8000 em dev)

**Variáveis opcionais:**
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — Para testar login OAuth (passe em branco em dev)
- `NEXT_PUBLIC_SENTRY_DSN` — Para erro tracking (pode ignorar em dev)

### Backend (`.env`)

Crie o arquivo `/backend/.env`:

```bash
cd backend
cat > .env << 'EOF'
# Database (PostgreSQL via Docker)
DATABASE_URL=postgresql+asyncpg://bookclub:bookclub@localhost:5432/bookclub

# Redis (cache + SSE) — usar local durante dev
REDIS_URL=redis://localhost:6379

# JWT Secret (gere um com: openssl rand -hex 32)
JWT_SECRET=seu-super-secreto-dev-key-aqui-minimo-32-chars

# Environment
ENVIRONMENT=dev

# Resend (email transacional) — OPCIONAL
# RESEND_API_KEY=seu_resend_api_key

# Google OAuth (OPCIONAL)
# GOOGLE_CLIENT_ID=seu_google_client_id
# GOOGLE_CLIENT_SECRET=seu_google_client_secret

# Sentry (OPCIONAL)
# SENTRY_DSN=seu_sentry_dsn
EOF
```

**Variáveis obrigatórias:**
- `DATABASE_URL` — Connection string do PostgreSQL
- `REDIS_URL` — Connection string do Redis (local em dev)
- `JWT_SECRET` — Chave JWT (mínimo 32 caracteres)
- `ENVIRONMENT` — `dev` ou `prod`

**Variáveis opcionais em dev:**
- `RESEND_API_KEY` — Para enviar emails (pode ignorar)
- `GOOGLE_CLIENT_ID/SECRET` — Para OAuth Google (pode ignorar)
- `SENTRY_DSN` — Para erro tracking (pode ignorar)

**Gerar JWT_SECRET seguro:**
```bash
openssl rand -hex 32
# Ou em Python:
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## 3. Subir Infraestrutura (PostgreSQL + Redis + MinIO)

Na **raiz do projeto**, execute:

```bash
make up
```

Isso irá:
1. Iniciar PostgreSQL em `localhost:5432`
2. Iniciar Redis em `localhost:6379`
3. Iniciar MinIO em `localhost:9000` (storage local S3-compatível)

**Verificar se tudo está rodando:**

```bash
docker compose -f infra/docker-compose.yml ps
```

Esperado:
```
NAME            STATUS
postgres        Up (healthy)
redis           Up (healthy)
minio           Up (healthy)
```

**Se algo não iniciar:**
```bash
# Ver logs detalhados
docker compose -f infra/docker-compose.yml logs postgres

# Reiniciar tudo
make down
make up
```

---

## 4. Aplicar Migrations (Backend)

Crie as tabelas no PostgreSQL:

```bash
make migrate
```

Isso executa `alembic upgrade head`, que:
- Lê arquivos em `/backend/alembic/versions/`
- Aplica cada migration em ordem
- Cria todas as tabelas, índices, RLS policies

**Se algo der errado:**
```bash
# Ver histórico de migrations
cd backend
alembic history

# Reverter última migration
alembic downgrade -1

# Reaplica tudo
alembic upgrade head
```

---

## 5. (Opcional) Popular com Dados de Teste

Se quiser dados iniciais para desenvolvimento:

```bash
make seed
```

Isso executa `/backend/app/db/seed.py` e popula:
- Usuários de teste
- Grupos de exemplo
- Rodadas com livros
- Mensagens de chat
- Reviews

---

## 6. Iniciar os Serviços

Você precisa de **3 terminais separados**:

### Terminal 1: Backend FastAPI

```bash
cd backend

# Se ainda não ativou o venv:
source venv/bin/activate  # ou .\venv\Scripts\activate no Windows

# Iniciar servidor
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Esperado:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

**Endpoints úteis para testar:**
- `http://localhost:8000/api/v1/health` — Health check
- `http://localhost:8000/docs` — Swagger UI (documentação interativa)
- `http://localhost:8000/redoc` — ReDoc (documentação de referência)

### Terminal 2: Frontend Next.js

```bash
cd frontend
npm run dev
```

**Esperado:**
```
  ▲ Next.js 16.1.6
  - ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

**Acessar:**
- `http://localhost:3000` — Aplicação principal
- `http://localhost:3000/__nextjs_original-stack-frame` — Erros em dev

### Terminal 3 (Opcional): Logs da Infraestrutura

Monitorar PostgreSQL, Redis e MinIO em tempo real:

```bash
make logs
```

---

## 7. Acessar a Aplicação

Abra o navegador em:

```
http://localhost:3000
```

Você deve ver a landing page ou tela de login.

**Testar fluxo de autenticação:**

1. Clicar em "Registrar" ou "Login"
2. Criar conta com email + senha
3. Ingressar ou criar um grupo
4. Nominar um livro
5. Votar

**Testar Chat em tempo real:**

1. Abra a mesma conversa em 2 navegadores
2. Envie uma mensagem em um
3. Deve aparecer instantaneamente no outro

---

## Troubleshooting

### ❌ "Docker container não inicia"

**Erro típico:** `Error response from daemon: bind: address already in use`

**Solução:**
```bash
# Encontrar qual processo está usando a porta
lsof -i :5432    # PostgreSQL
lsof -i :6379    # Redis
lsof -i :9000    # MinIO

# Matar o processo (macOS/Linux)
kill -9 <PID>

# Ou simplesmente usar outras portas:
# Edite docker-compose.yml e mude os ports
```

---

### ❌ "Frontend não sobe - erro npm"

**Erro:** `npm ERR! missing script: "dev"` ou erro de dependências

**Solução:**
```bash
cd frontend

# Limpar cache e reinstalar
rm -rf node_modules package-lock.json
npm install

# Tentar novamente
npm run dev
```

---

### ❌ "Erro de conexão com PostgreSQL"

**Erro:** `FATAL: password authentication failed for user "bookclub"`

**Solução:**
```bash
# Verificar se o container está rodando
docker compose -f infra/docker-compose.yml ps

# Verificar variável de ambiente no backend
echo $DATABASE_URL  # ou echo %DATABASE_URL% no Windows

# Deve ser:
# postgresql+asyncpg://bookclub:bookclub@localhost:5432/bookclub

# Se container não está rodando:
make up

# Se o erro persiste, resetar tudo:
make reset
make migrate
```

---

### ❌ "Migrations falhando"

**Erro:** `Error: Can't locate revision identified by 'base'` ou similar

**Solução:**
```bash
cd backend

# Ver histórico
alembic history

# Resetar banco e migrations
make reset
make migrate

# Ou manualmente:
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
alembic upgrade head
```

---

### ❌ "Porta 3000 / 8000 já em uso"

**Next.js em outra porta:**
```bash
npm run dev -- -p 3001
```

**FastAPI em outra porta:**
```bash
uvicorn main:app --reload --port 8001
```

---

### ❌ "Error loading ASGI app. Could not import module"

**Contexto:** Tentando rodar com `uvicorn app.main:app` quando o arquivo está em `main.py`

**Solução (CORRETO):**
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

### ❌ "ModuleNotFoundError: No module named 'fastapi'"

**Solução:**
```bash
cd backend

# Certifique-se que o venv está ativado:
source venv/bin/activate  # Linux/macOS
# ou
.\venv\Scripts\activate   # Windows

# Instale novamente
pip install -r requirements.txt
```

**Verificar venv ativado:**
```bash
# Deve ter "(venv)" no início do prompt
which python       # Linux/macOS — deve mostrar venv/bin/python
Get-Command python # Windows — deve mostrar venv/Scripts/python
```

---

### ❌ "Redis não conecta em tempo real (SSE)"

**Erro:** Mensagens não aparecem em tempo real, ou erro ao criar chat

**Causas:**
1. Redis não está rodando
2. `REDIS_URL` está errada
3. Está usando URL HTTP em vez de TCP

**Solução:**
```bash
# Verificar Redis rodando
docker compose -f infra/docker-compose.yml ps redis

# Verificar .env no backend
cat backend/.env | grep REDIS_URL
# Deve ser: redis://localhost:6379

# Em produção (Upstash), usar:
# REDIS_URL=redis://default:<token>@<host>:<port>

# NUNCA usar URL HTTP em dev/prod:
# ❌ REDIS_URL=https://...
# ✅ REDIS_URL=redis://...
```

---

### ❌ "MinIO bucket não aparece"

**Solução:**
```bash
# Acessar console web do MinIO
# http://localhost:9001

# Username: minioadmin
# Password: minioadmin

# Criar bucket "bookclub-public" se não existir
# Verificar se está public (policy)
```

---

## Comandos Úteis do Makefile

```bash
# Infraestrutura
make up              # Inicia PostgreSQL, Redis, MinIO
make down            # Para containers (dados preservados)
make reset           # Destroi tudo e recria do zero
make logs            # Tail logs em tempo real

# Database
make migrate         # Aplica todas as migrations
make migration msg="descrição"  # Cria nova migration
make migrate-down    # Reverter última migration
make seed            # Popular com dados de teste

# Atalho: tudo de uma vez
make up && make migrate && make seed
```

---

## Estrutura Rápida

```
bookclubinho/
├── frontend/          → Next.js 15+ App Router
├── backend/           → FastAPI Python
├── infra/             → docker-compose.yml
├── docs/              → Documentação
├── Makefile           → Atalhos make
├── CLAUDE.md          → Instruções para Claude Code
├── GETTING_STARTED.md → Este arquivo
└── README.md          → Overview do projeto
```

---

## Próximos Passos Após Setup

1. **Ler CLAUDE.md**
   ```bash
   cat CLAUDE.md
   ```
   Convenções de código, segurança, estrutura de commits.

2. **Consultar ARCHITECTURE.md para entender o design**
   ```bash
   cat docs/ARCHITECTURE.md
   ```

3. **Explorar Swagger da API**
   - Abra http://localhost:8000/docs
   - Teste endpoints interativamente

4. **Criar uma issue ou feature branch**
   ```bash
   git checkout -b feat/sua-feature
   ```

5. **Consultar troubleshooting se algo quebrar**
   - Veja seção acima
   - Ou leia `/docs/RUNBOOK.md` para produção

---

## Dicas de Desenvolvimento

### Hot Reload

- **Frontend:** Funciona automaticamente. Edite um arquivo em `frontend/src/` e o navegador atualiza
- **Backend:** Ativado com `--reload` no uvicorn. Mesma coisa

### Database

Inspecionar o banco durante desenvolvimento:

```bash
# Via psql (se tiver instalado)
psql -U bookclub -d bookclub -h localhost

# Ou use pgAdmin:
# http://localhost:5050
# Username: admin@example.com
# Password: admin
```

### Logs

- **Backend:** Estruturados em JSON no stdout (coloridos em dev)
- **Frontend:** Console do navegador + logs do Next.js
- **Docker:** `make logs` para infra

### Performance

Monitorar em dev:
- **Frontend:** DevTools → Performance tab
- **Backend:** Sentry em produção, logs em dev

---

## Resetar Tudo do Zero

Se algo ficar muito quebrado:

```bash
# 1. Parar e limpar containers
make reset

# 2. Limpar node_modules e cache
cd frontend && rm -rf node_modules .next && npm install
cd ../backend && rm -rf venv && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt

# 3. Aplicar migrations
make migrate

# 4. Iniciar de novo
# Terminal 1:
cd backend && source venv/bin/activate && uvicorn main:app --reload

# Terminal 2:
cd frontend && npm run dev
```

---

## Checklist de Setup Completo

- [ ] Node.js 18+ instalado (`node --version`)
- [ ] Python 3.12+ instalado (`python --version`)
- [ ] Docker rodando (`docker ps`)
- [ ] Frontend dependências instaladas (`frontend/npm install`)
- [ ] Backend venv criado e ativado
- [ ] Backend dependências instaladas (`pip install -r requirements.txt`)
- [ ] Frontend `.env.local` criado
- [ ] Backend `.env` criado
- [ ] `make up` rodou com sucesso
- [ ] `make migrate` rodou com sucesso
- [ ] Backend rodando em `localhost:8000` (Swagger em `/docs`)
- [ ] Frontend rodando em `localhost:3000`
- [ ] Chat em tempo real funciona (testar em 2 abas)
- [ ] Pronto para desenvolver!

---

## Referências

- [README.md](./README.md) — Overview do projeto
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — Arquitetura completa
- [docs/RUNBOOK.md](./docs/RUNBOOK.md) — Procedimentos de produção
- [CLAUDE.md](./CLAUDE.md) — Instruções para código

---

**Problemas não mencionados acima?**

1. Procure nos logs: `docker compose logs -f`
2. Consulte ARCHITECTURE.md para contexto
3. Verifique se o `.env` está preenchido
4. Tente `make reset` se tudo mais falhar

**Sucesso no setup!** Agora você está pronto para desenvolver. Leia CLAUDE.md para convenções do projeto.
