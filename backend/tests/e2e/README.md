# E2E contra backend e Postgres reais

Estes testes existem porque os de unidade mockam o `db` inteiro, e três bugs
passaram por baixo deles:

- **#215** — a resposta saía antes do commit, então as BackgroundTasks rodavam
  antes e o badge checker, com sessão própria, não via as linhas novas. Quase
  nenhum badge era concedido, em silêncio.
- **#212** — `register` devolvia 500 quando o envio de email falhava, depois de
  já ter commitado a conta.
- **#214** — `_user_display` era recursão infinita: cinco emails de notificação
  nunca saíam.

Nenhum deles é alcançável sem banco de verdade.

## Rodando

Sobe a infra local (o `infra/docker-compose.yml` tem as mesmas imagens; com
podman sem provider de compose, direto):

```bash
podman run -d --name bookclub-pg \
  -e POSTGRES_USER=bookclub -e POSTGRES_PASSWORD=bookclub -e POSTGRES_DB=bookclub \
  -p 5432:5432 docker.io/library/postgres:16-alpine
podman run -d --name bookclub-redis -p 6379:6379 docker.io/library/redis:7-alpine
```

Um `.env` apontando para eles — copie o seu e troque duas linhas:

```
DATABASE_URL=postgresql://bookclub:bookclub@localhost:5432/bookclub
REDIS_URL=redis://localhost:6379/0
ALLOWED_ORIGINS=http://localhost:3000
ENVIRONMENT=dev
```

`ENVIRONMENT=dev` importa: `cookies.py` deriva `secure` de `DEBUG`, e com
`secure=True` os cookies de auth são descartados sobre `http://localhost`.

Migrations e servidor:

```bash
set -a && source .env.e2e && set +a
alembic upgrade head
uvicorn main:app --port 8010
```

E então:

```bash
E2E_API_URL=http://localhost:8010/api/v1 \
E2E_DSN=postgresql://bookclub:bookclub@localhost:5432/bookclub \
  python tests/e2e/round_lifecycle.py
```

Saída esperada: `30 passaram, 0 falharam`.

## Duas coisas que vão te morder

**Rate limit.** Vários endpoints são `30/minute` ou menos, por IP. Rodar o script
em sequência esgota o limite e os 429 aparecem como falhas confusas. Entre
corridas: `podman exec bookclub-redis redis-cli FLUSHALL`.

**Usuários são semeados direto no banco**, com `email_verified=true`, em vez de
passar por `POST /auth/register`. Dois motivos: o Resend recusa domínios de teste,
e o register devolve 500 quando o email falha (#212). Quando a #212 for corrigida,
vale trocar por registro de verdade — o caminho passaria a ser coberto.

## Estado do banco

O script não limpa depois de si. Para uma corrida limpa:

```bash
podman exec bookclub-pg psql -U bookclub -d bookclub -c "
TRUNCATE user_badges, reading_progress, book_reviews, round_votes,
         round_nominations, rounds, group_messages, group_members,
         groups, users CASCADE;"
```

Nunca aponte isto para o banco de produção.

## media_key_backfill.py

Verifica o backfill da migration 0023. Precisa de um banco **descartável** —
escreve em `group_messages` e o nome do DSN tem que conter `_mig` (ou
`E2E_ALLOW_ANY_DB=1`, se você souber o que está fazendo).

Duas passagens, porque o estado a conferir é o que a migration deixou:

```bash
export PGPASSWORD=bookclub
createdb -h 127.0.0.1 -U bookclub bookclub_mig
D=postgresql://bookclub:bookclub@localhost:5432/bookclub_mig

alembic upgrade 0022                                    # schema anterior
E2E_DSN=$D python tests/e2e/media_key_backfill.py       # planta os 4 casos
alembic upgrade head                                    # roda o backfill
VERIFICAR=1 E2E_DSN=$D python tests/e2e/media_key_backfill.py
```

Saída esperada: `8 passaram, 0 falharam`. Com o backfill original (padrão
`'media/[^?]+'`, sem o `group_id`), dá `4 passaram, 4 falharam` — é o que o
script existe para pegar.
