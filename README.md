# Bookclubinho

Uma plataforma colaborativa para gerenciar grupos de leitura, permitindo criar clubes, votar em livros, acompanhar progresso de leitura, discutir e compartilhar experiências de forma integrada e engajante.

[Documentação completa](./docs) · [Setup rápido](./GETTING_STARTED.md) · [Deploy](./DEPLOY.md) · [Arquitetura](./docs/ARCHITECTURE.md) · [Runbook de produção](./docs/RUNBOOK.md)

---

## Visão Geral

Bookclubinho é uma webapp full-stack que torna a experiência de clube do livro digital. Os usuários podem:

- **Criar ou ingressar em grupos** de leitura com até 8 membros
- **Indicar e votar em livros** (integração com Hardcover API para catálogo)
- **Acompanhar progresso** de leitura com streak de dias consecutivos
- **Chat em tempo real** com estilo iMessage — mensagens, reações emoji, citações
- **Escrever reviews** após finalizar livros (rating de estrelas + características)
- **Agendar encontros** do clube com RSVP dos membros
- **Desbloquear badges** por milestones (leitura, atividade, comunidade)
- **Visualizar Wrapped anual** com estatísticas personalizadas

---

## Tech Stack

### Frontend

- **Framework:** Next.js 16+ com App Router
- **Linguagem:** TypeScript strict mode
- **Styling:** Tailwind CSS + shadcn/ui (new-york)
- **Animações:** Framer Motion
- **Estado:** Zustand
- **HTTP:** React Query (TanStack Query)
- **Editor Rich Text:** Tiptap
- **Deploy:** Vercel

### Backend

- **Framework:** FastAPI com Python 3.12+
- **Validation:** Pydantic v2
- **Database:** SQLAlchemy 2.0 async + asyncpg
- **Migrations:** Alembic
- **Auth:** httpOnly cookies + JWT HS256 + OAuth2 Google + magic link
- **Cache & Realtime:** Upstash Redis (HTTP para cache, TCP para SSE)
- **Rate Limiting:** slowapi + Redis
- **Logs estruturados:** structlog
- **Deploy:** Render

### Infraestrutura

- **Database:** PostgreSQL (Render)
- **Cache & Realtime:** Upstash Redis (TCP + HTTP)
- **Storage:** Cloudflare R2 (avatars, media, exports)
- **Email transacional:** Resend
- **Livros:** Hardcover GraphQL API
- **Observabilidade:** Sentry (erros + performance)
- **DNS/CDN:** Cloudflare

### Desenvolvimento Local

Docker Compose para:
- PostgreSQL 16 (porta 5432)
- Redis 7 (porta 6379)
- MinIO (storage local S3-compatível, porta 9000)

Frontend e backend rodam **nativamente no host** (não em Docker) para hot reload.

---

## Pré-requisitos

- **Node.js** 18+ (npm/yarn/pnpm)
- **Python** 3.12+
- **Docker** + **Docker Compose**
- **Git**

---

## Iniciando Rápido

### 1. Clone e instale dependências

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

### 2. Configure variáveis de ambiente

**Frontend** (`.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Backend** (`.env`):
```env
DATABASE_URL=postgresql+asyncpg://bookclub:bookclub@localhost:5432/bookclub
REDIS_URL=redis://localhost:6379
JWT_SECRET=seu-super-secreto-dev-key
ENVIRONMENT=dev
```

Para detalhes completos, veja [GETTING_STARTED.md](./GETTING_STARTED.md).

### 3. Inicie infraestrutura

```bash
make up
```

### 4. Aplique migrations

```bash
make migrate
```

### 5. Inicie os serviços (em terminais separados)

```bash
# Terminal 1
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd frontend
npm run dev
```

Abra `http://localhost:3000` no navegador.

---

## Estrutura do Projeto

```
bookclubinho/
├── frontend/                 # Next.js 16+ app
│   ├── src/
│   │   ├── app/             # App Router pages e layouts
│   │   ├── components/      # Componentes reutilizáveis
│   │   ├── lib/             # Helpers, clientes HTTP, utilitários
│   │   └── stores/          # Zustand stores
│   ├── package.json
│   └── next.config.ts
│
├── backend/                  # FastAPI Python
│   ├── app/
│   │   ├── api/             # Routers da API
│   │   ├── core/            # Config, segurança, dependências
│   │   ├── db/              # Models SQLAlchemy, engine, seeds
│   │   ├── schemas/         # Pydantic schemas (request/response)
│   │   ├── services/        # Lógica de negócio + APIs externas
│   │   ├── workers/         # Background tasks, notifications
│   │   ├── security/        # Sanitization, CSRF, rate limit
│   │   └── storage/         # Helpers R2/S3
│   ├── alembic/             # Database migrations
│   ├── main.py              # Entry point FastAPI
│   ├── pyproject.toml
│   └── requirements.txt
│
├── infra/                    # Infraestrutura local
│   ├── docker-compose.yml
│   └── .env.example
│
├── docs/                     # Documentação
│   ├── ARCHITECTURE.md       # Visão geral da arquitetura
│   ├── RUNBOOK.md            # Procedimentos operacionais
│   └── SETUP.md              # Setup detalhado
│
├── .claude/                  # Subagents especializados
│   ├── agents/
│   └── contexts/
│
├── Makefile                  # Atalhos de desenvolvimento
├── CLAUDE.md                 # Instruções para Claude Code
├── GETTING_STARTED.md        # Setup local passo a passo
└── README.md                 # Este arquivo
```

---

## Comandos de Desenvolvimento

### Infraestrutura

```bash
make up              # Iniciar PostgreSQL, Redis, MinIO
make down            # Parar containers (dados preservados)
make reset           # Destruir tudo e recrear do zero
make logs            # Ver logs em tempo real
```

### Database

```bash
make migrate         # Aplicar migrations (alembic upgrade head)
make migration msg="descrição"  # Criar nova migration
make migrate-down    # Reverter última migration
make seed            # Popular com dados de teste
```

### Frontend

```bash
cd frontend
npm run dev          # Development server (port 3000)
npm run build        # Build para produção
npm run lint         # ESLint check
npm test             # Rodar testes (Vitest)
npm run test:e2e     # Testes E2E (Playwright)
```

### Backend

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000  # Dev server
python -m pytest                          # Rodar testes
ruff check . && ruff format .             # Lint + format
```

---

## Arquitetura

### Segurança

- **RLS (Row Level Security)** habilitado em todas as tabelas
- **CSRF** via double-submit cookie
- **Rate limiting** com Upstash Redis
- **Auth:** httpOnly cookies + JWT HS256
- **Input sanitization:** bleach.clean() no backend
- **File uploads:** validação magic bytes + re-encode + EXIF strip
- **PII masking:** Sentry + structlog com scrubbers

Ver [ARCHITECTURE.md](./docs/ARCHITECTURE.md) para detalhes completos.

### Realtime

- SSE (Server-Sent Events) via Redis Streams (TCP Upstash)
- Sem WebSockets — SSE é suficiente para o caso de uso

### Autenticação

```
httpOnly cookies (access + refresh) + JWT HS256
+ OAuth2 Google
+ Magic link (email passwordless)
```

### Storage

- **Público:** avatars, imagens de grupos → Cloudflare R2 via CDN
- **Privado:** media, exports → R2 com presigned URLs (1h expiry)

---

## Modelo de Dados

Principais entidades:

- **User** — conta, perfil, streak, stats
- **Group** — clube (max 8 membros, invite_code)
- **Round** — rodada de votação/leitura (5 states: nominating → voting → reading → reviewing → finished)
- **RoundNomination** — indicação de livro
- **RoundVote** — voto em livro
- **ReadingProgress** — snapshots imutáveis de progresso
- **GroupMessage** — chat (text/image/gif/quote/chapter_marker/spoiler)
- **BookReview** — review pós-livro (rating + características)
- **Meeting** — encontro do clube
- **Badge + UserBadge** — conquistas desbloqueadas
- **AuditLog** — log imutável de segurança

Ver [ARCHITECTURE.md](./docs/ARCHITECTURE.md) para diagrama completo.

---

## Convenções de Código

### Python

- **Lint/Format:** ruff (zero compromissos)
- **Type hints:** obrigatório em tudo
- **Async por padrão**
- **Snake_case** para variáveis e funções
- **SQLAlchemy ORM only** — zero SQL raw (exceto com `text()` validado)
- **Dependency injection:** FastAPI `Depends()`
- **Logs:** structlog com PII scrubber

### TypeScript

- **Strict mode** obrigatório
- **PascalCase** para componentes
- **camelCase** para funções e variáveis
- **kebab-case** para arquivos e rotas
- **Server Components** por padrão
- **Tailwind only** — zero CSS custom

### Segurança Não-Negociável

- ✅ RLS habilitado em toda tabela
- ✅ Sem stack traces em respostas públicas
- ✅ Sem secrets no frontend (só `NEXT_PUBLIC_*`)
- ✅ Sem `dangerouslySetInnerHTML` sem DOMPurify
- ✅ Sem tokens em localStorage
- ✅ Sanitization via bleach.clean() e Tiptap allowlist
- ✅ File upload: validação magic bytes + Pillow re-encode + EXIF strip
- ✅ Auth responses: sempre idênticas (sem email enumeration)

---

## Padrões de API

- Todas as rotas sob `/api/v1/*`
- Auth via **httpOnly cookies** (nunca Authorization header)
- Paginação: **cursor-based** (nunca offset)
- Erro padrão: `{"detail": "mensagem"}`
- Realtime: SSE via Redis Streams (TCP)
- Rate limiting: slowapi + Upstash Redis

---

## Contribuindo

1. **Crie uma branch descritiva:**
   ```bash
   git checkout -b feat/descricao-da-feature
   # ou
   git checkout -b fix/descricao-do-bug
   ```

2. **Siga as convenções:**
   - Leia [CLAUDE.md](./CLAUDE.md) para instruções de código
   - Commits atômicos com mensagens em português
   - Testes unitários para novas features

3. **Teste localmente:**
   ```bash
   # Frontend
   npm run lint
   npm test

   # Backend
   ruff check . && python -m pytest
   ```

4. **Abra um Pull Request:**
   - Título e descrição em português
   - Referencie issues relacionadas
   - Aguarde code review

5. **Merge para master:**
   - Deploy automático em Vercel + Render
   - Migrations rodam antes do servidor iniciar

---

## Troubleshooting

### Erro de conexão com banco

```bash
docker compose -f infra/docker-compose.yml ps
# Se não estiver rodando:
make up
```

### Porta já em uso

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

### Redis não conecta

Verifique `REDIS_URL` no `.env` (deve apontar para Redis local em dev):
```env
REDIS_URL=redis://localhost:6379
```

### SSE não funciona

Certifique-se de estar usando a **conexão TCP** do Upstash (não HTTP):
```env
# Correto
REDIS_URL=redis://localhost:6379

# Errado (isso é a API HTTP)
REDIS_URL=https://...
```

Para mais, veja [GETTING_STARTED.md](./GETTING_STARTED.md).

---

## Monitoramento em Produção

- **Sentry:** erros + performance tracing (DSN separados para backend/frontend)
- **Render:** logs de aplicação, deploys e métricas do backend/worker
- **Runbook:** procedimentos de credenciais e incidentes em [docs/RUNBOOK.md](./docs/RUNBOOK.md)

---

## Roadmap

- [ ] Integração com Goodreads (importar shelf)
- [ ] Notificações push web
- [ ] Dark mode melhorado
- [ ] Mobile app nativa (React Native)
- [ ] Clubes privados (invite-only)
- [ ] Estatísticas por autor/gênero

---

## Licença

Propriedade privada. Uso restrito à equipe autorizada.

---

## Suporte

- **Dúvidas de setup?** Leia [GETTING_STARTED.md](./GETTING_STARTED.md)
- **Deploy quebrou?** Veja [docs/RUNBOOK.md](./docs/RUNBOOK.md)
- **Arquitetura?** Consulte [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Instruções de código?** [CLAUDE.md](./CLAUDE.md)

---

**Última atualização:** 2026-03-24
