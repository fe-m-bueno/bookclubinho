# Guia de Setup Local - Bookclubinho

Instruções para rodar o projeto localmente no seu computador.

## Pré-requisitos

- **Node.js** 18+ (para o frontend)
- **Python** 3.12+ (para o backend)
- **Docker** + **Docker Compose** (para banco de dados e Redis)
- **npm** (ou yarn/pnpm)

## 1. Clonar e Instalar Dependências

```bash
# Clonar o repositório
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

## 2. Configurar Variáveis de Ambiente

### Frontend (`.env.local`)

Criar arquivo `/frontend/.env.local`:

```env
# URLs da API
NEXT_PUBLIC_API_URL=http://localhost:8000

# Serviços externos (opcional para desenvolvimento local)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<seu_google_client_id>
```

### Backend (`.env`)

Criar arquivo `/backend/.env`:

```env
# Banco de dados (PostgreSQL via Docker)
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/bookclub

# Redis (cache + SSE)
UPSTASH_REDIS_URL=redis://localhost:6379

# JWT
SECRET_KEY=seu-super-secreto-dev-key-aqui

# Resend (email - opcional)
RESEND_API_KEY=<sua-chave-resend>

# Google OAuth (opcional)
GOOGLE_CLIENT_ID=<seu_id>
GOOGLE_CLIENT_SECRET=<seu_secret>

# Environment
ENVIRONMENT=development
```

## 3. Subir Infraestrutura (PostgreSQL + Redis + MinIO)

Na raiz do projeto, use o Makefile:

```bash
make up
```

**Verifica se tudo está rodando:**
```bash
docker compose -f infra/docker-compose.yml ps
```

Esperado:
- PostgreSQL em `localhost:5432`
- Redis em `localhost:6379`
- MinIO em `localhost:9000` (storage local)

**Outros comandos úteis:**
```bash
make down      # Parar containers (preserva dados)
make reset     # Destruir e recriar tudo do zero
make logs      # Ver logs em tempo real
```

## 4. Rodar Migrations (Backend)

```bash
cd backend
alembic upgrade head
```

Isso cria as tabelas no banco de dados.

## 5. Iniciar os Serviços

### Terminal 1 - Backend

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend roda em `http://localhost:8000`

### Terminal 2 - Frontend

```bash
cd frontend
npm run dev
```

Frontend roda em `http://localhost:3000`

## 6. Acessar a Aplicação

Abra o navegador em `http://localhost:3000`

---

## Troubleshooting

### ❌ "Fiz `make up` mas o frontend não subiu"

**Contexto:** `make up` só sobe a infraestrutura (PostgreSQL, Redis, MinIO). Frontend e backend precisam rodar em terminais separados.

**Solução:**
```bash
# Em um terminal DIFERENTE:
cd frontend
npm run dev
```

O frontend **nunca sobe automaticamente** com `make up`. Você precisa rodá-lo manualmente.

### ❌ "Frontend não sobe - erro npm"

**Erro:** `npm ERR! missing script: "dev"` ou similar

**Solução:**
```bash
cd frontend
npm install  # Reinstale dependências
npm run dev
```

### ❌ "Erro de conexão com banco de dados"

**Erro:** `FATAL: password authentication failed for user "postgres"`

**Solução:**
```bash
# Verifique se o container PostgreSQL está rodando
docker-compose ps

# Se não tiver rodado:
cd infra
docker-compose up -d
```

### ❌ "Porta 3000 / 8000 já em uso"

**Solução para Next.js:**
```bash
# Rodar em outra porta
npm run dev -- -p 3001
```

**Solução para FastAPI:**
```bash
# Rodar em outra porta
uvicorn app.main:app --reload --port 8001
```

### ❌ "Error loading ASGI app. Could not import module"

**Contexto:** Tentando rodar com `uvicorn app.main:app` quando o arquivo está em `main.py`

**Solução:**
```bash
cd backend
# Correto:
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Errado:
# uvicorn app.main:app --reload ...
```

### ❌ "ModuleNotFoundError: No module named 'fastapi'"

**Solução:**
```bash
cd backend
pip install -r requirements.txt
```

### ❌ "Redis não conecta"

Verifique a variável de ambiente:
```bash
# Deve apontar para o Redis local
UPSTASH_REDIS_URL=redis://localhost:6379
```

---

## Comandos do Makefile

```bash
make up          # ⬆️  Sobe PostgreSQL, Redis e MinIO
make down        # ⬇️  Para containers (dados preservados)
make reset       # 🔄 Destroi e recria tudo do zero
make logs        # 📊 Ver logs em tempo real
make migrate     # 🗄️  Roda migrations do banco
make migration msg="descrição"  # ✨ Cria nova migration
make seed        # 🌱 Popula banco com fixtures
```

## Estrutura Rápida

```
bookclubinho/
├── frontend/          → Next.js 15+ (React)
├── backend/           → FastAPI (Python)
├── infra/             → docker-compose.yml (PostgreSQL, Redis, MinIO)
├── docs/              → Documentação de arquitetura
├── Makefile           → Atalhos de desenvolvimento
├── CLAUDE.md          → Instruções para o Claude Code
└── GETTING_STARTED.md → Este arquivo
```

---

## Próximos Passos

- Leia **`CLAUDE.md`** para convenções do projeto
- Consulte **`docs/ARCHITECTURE.md`** para entender a estrutura
- Veja **`docs/SETUP.md`** para setup mais detalhado
- Veja **`docs/RUNBOOK.md`** se algo quebrar em produção

---

**Problemas?** Verifique que:
- ✅ Docker está rodando e saudável
- ✅ `.env` está preenchido no backend
- ✅ `.env.local` existe no frontend
- ✅ Todos os `npm install` foram rodados
