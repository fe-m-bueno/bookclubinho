# RUNBOOK — Bookclubinho

Procedimentos operacionais para rotação de credenciais, resposta a incidentes e recuperação.

---

## Rotação de Credenciais

### JWT_SECRET

**Quando rotacionar:** a cada 90 dias, ou imediatamente após suspeita de vazamento.

**Impacto:** todos os tokens de acesso e refresh ativos são invalidados. Usuários precisarão fazer login novamente.

**Passos:**
1. Gere um novo segredo: `openssl rand -hex 64`
2. No Render, atualize a variável `JWT_SECRET` no serviço `bookclub-api`.
3. Confirme que o worker `bookclub-worker` está herdando o mesmo valor via `fromService`.
3. Faça o deploy do backend.
4. Invalide todas as sessões ativas via SQL:
   ```sql
   DELETE FROM user_sessions;
   ```
5. Monitore o Sentry por erros de autenticação nos 15 minutos seguintes.

---

### S3 / Cloudflare R2 (Access Key + Secret)

**Quando rotacionar:** a cada 90 dias, ou após offboarding de desenvolvedor com acesso.

**Passos:**
1. No painel Cloudflare R2, crie um novo par de chaves de API.
2. Atualize `S3_ACCESS_KEY` e `S3_SECRET_KEY` no Render.
3. Faça o deploy.
4. Verifique uploads de avatar em staging.
5. Revogue as chaves antigas no painel Cloudflare.

---

### Resend API Key

**Quando rotacionar:** a cada 90 dias, ou após suspeita de uso indevido.

**Passos:**
1. No painel Resend, crie uma nova API key com os mesmos escopos.
2. Atualize `RESEND_API_KEY` no Render.
3. Faça o deploy.
4. Envie um email de teste via `/api/v1/auth/magic-link`.
5. Revogue a chave antiga no painel Resend.

---

### Google OAuth (Client Secret)

**Quando rotacionar:** após suspeita de comprometimento, ou requerimento do Google.

**Passos:**
1. No Google Cloud Console, gere um novo Client Secret para o OAuth App.
2. Atualize `GOOGLE_CLIENT_SECRET` no Render e confirme que `APP_URL`/`ALLOWED_ORIGINS` permanecem apontando para o domínio do Vercel.
3. Faça o deploy de backend e frontend.
4. Teste o fluxo OAuth completo em staging.
5. Revogue o secret antigo no Google Cloud Console.

---

### Sentry DSN

**Quando rotacionar:** após suspeita de uso não autorizado ou offboarding.

**Passos:**
1. No painel Sentry, crie um novo DSN para o projeto.
2. Atualize `SENTRY_DSN` (backend) no Render e `NEXT_PUBLIC_SENTRY_DSN` (frontend) no Vercel.
3. Faça o deploy.
4. Force um erro de teste para confirmar que os eventos chegam ao Sentry.
5. Revogue o DSN antigo no Sentry.

---

## Procedimentos de Incidente

### Suspeita de Conta Comprometida

1. Revogar todas as sessões do usuário:
   ```sql
   DELETE FROM user_sessions WHERE user_id = '<user_id>';
   ```
2. Forçar reset de senha via magic link.
3. Verificar `audit_log` para atividade suspeita:
   ```sql
   SELECT action, ip_hash, user_agent, created_at
   FROM audit_log
   WHERE user_id = '<user_id>'
   ORDER BY created_at DESC
   LIMIT 50;
   ```

### Brute Force em Andamento

1. Verificar Redis:
   ```
   redis-cli keys "login_fail:*" | head -20
   redis-cli keys "login_lock:*" | head -20
   ```
2. Se ataque massivo, aumentar `_LOGIN_MAX_FAILS` via feature flag (atualizar código + deploy).
3. Bloquear IP no nível do Render ou Cloudflare.

### Spam / Flood no Chat

1. Verificar Redis para chaves de flood:
   ```
   redis-cli keys "chat_flood:*" | head -20
   ```
2. Banir usuário via admin (revogar membership + blacklist Redis).
3. Revisar `message_reports` para padrões de abuso:
   ```sql
   SELECT reported_user_id, count(*) as report_count
   FROM message_reports
   WHERE created_at > now() - interval '24 hours'
   GROUP BY reported_user_id
   ORDER BY report_count DESC;
   ```

### Vazamento de Secrets

1. Rotacionar imediatamente a credencial afetada (ver seções acima).
2. Auditar logs de acesso do Render, Vercel e Cloudflare para uso indevido.
3. Notificar usuários afetados se dados foram expostos (obrigação LGPD).
4. Revogar todos os tokens de usuário como medida de precaução.

---

## Recuperação de Banco de Dados

### Restore de Backup (Neon)

1. Acesse o painel do Neon → o projeto → Branches / Restore.
2. Selecione o ponto de restauração (Neon faz point-in-time por branch).
3. Restaure para uma **branch nova** primeiro, para validar sem tocar na atual.
4. Atualize `DATABASE_URL` (e `DATABASE_APP_URL`, se estiver em uso) para apontar
   ao endpoint da branch restaurada.
5. Execute `alembic upgrade head` para garantir que migrations estão sincronizadas.
6. Se `DATABASE_APP_URL` estiver em uso, o papel `bookclub_app` precisa existir na
   branch restaurada com os mesmos `GRANT`s — papel e privilégio acompanham a
   branch, mas confira antes de apontar o serviço para lá.

---

## RLS: ligar de verdade

**Estado atual: RLS não está valendo em produção.** O app conecta com um papel
superusuário, e superusuário não avalia política — nem com `FORCE ROW LEVEL
SECURITY`. As políticas das migrations 0005 em diante são, hoje, documentação
executável.

As migrations 0025–0027 corrigiram os cinco defeitos que impediam a troca, e o
fluxo completo foi verificado num Postgres 16 com o app num papel sem
`BYPASSRLS` e sem posse das tabelas: registro, login, rota autenticada, criação
de grupo, lista de membros, chat, stats, criação/uso/revogação de token.

O que falta é **um passo de configuração**: apontar o `DATABASE_URL` do serviço
para um papel restrito. Enquanto isso não acontece, nada disso tem efeito — quem
ignora RLS não enxerga política nenhuma.

### Os cinco defeitos, todos verificados sob papel comum

1. **Consultas que estabelecem identidade.** Login, registro, magic link, OAuth,
   refresh e resolução de Bearer leem `users`/`user_sessions`/
   `personal_access_tokens` antes de haver `app.current_user_id`. Sem porta, o
   login responde "credenciais inválidas" para todo mundo. Porta nomeada:
   `app.auth_lookup` (0025).
2. **`current_setting` vira `''`, não NULL.** Depois que um `set_config(...,
   true)` termina, a GUC passa a valer string vazia. Numa conexão de pool,
   `''::uuid` **levanta erro** e aborta a transação. Eram 63 políticas em 20
   tabelas; a 0026 reescreveu todas com `nullif(...)`.
3. **`INSERT ... RETURNING` é checado pela política de SELECT**, não pela de
   INSERT. Todo `login_failed` e `register` sumia do `audit_log` em silêncio,
   porque `log_event` engole o próprio erro (0025).
4. **Commit no meio da requisição zerava o contexto.** `set_config(..., true)`
   morre no commit, e `register_user` commita antes do `log_event`. Corrigido
   com um gancho `after_begin` que reaplica o contexto a cada transação nova
   (`app/db/engine.py` + `rls.reapply_context_on_new_transaction`).

6. **`groups` era legível por qualquer autenticado** (0028). `groups_select` dizia
   `is_active AND current_setting('app.current_user_id') != ''` — ou seja,
   qualquer usuário logado lia **qualquer** grupo ativo. E RLS filtra linha, não
   coluna, então isso incluía o `invite_code`, que é a credencial de entrada.
   Era a única tabela em que ligar RLS não somava nada. Medido na branch de
   validação: antes, um usuário sem vínculo lia os 3 grupos; depois, 0.

5. **Políticas recursivas** (0027). `group_members_select/update/delete`
   perguntavam "você participa deste grupo?" lendo `group_members` de dentro da
   política de `group_members` — `infinite recursion detected in policy`, erro
   duro. Como 31 políticas de outras tabelas checam participação da mesma forma,
   caíam junto: grupo, chat, rodada, review e encontro. A pergunta saiu para duas
   funções `SECURITY DEFINER` (`app_is_group_member`, `app_is_group_admin`).

### O `NO FORCE` em `group_members`, e por que ele não afrouxa nada

`FORCE ROW LEVEL SECURITY` aplica as políticas **também ao dono da tabela**. Com
ele ligado, a função `SECURITY DEFINER` continua presa e devolve `false` em
silêncio — nega acesso a quem tem direito. Por isso a 0027 desliga o `FORCE`
nessa tabela, e **só nessa**.

Isso não afrouxa nada para a aplicação, e o motivo é simples: **papel que não é
dono está sujeito a RLS sempre, com ou sem `FORCE`.** Medido no ambiente de
verificação, com o app num papel não-dono:

| contexto | `group_members` | `group_messages` | `personal_access_tokens` |
|---|---|---|---|
| sem usuário | 0 | 0 | 0 |
| membro do grupo | 1 | 1 | 1 |
| usuário estranho | 0 | 0 | 0 |

O único cenário que o `FORCE` cobria é o app conectando **como dono da tabela** —
exatamente o que a separação de papéis elimina. Se um dia o app voltar a
conectar como dono, este raciocínio deixa de valer.

Nada aqui **cria** um papel com `BYPASSRLS`. No Neon o `neondb_owner` já vem com
ele, e é isso que o torna certo para migration e errado para o app.

Consequência boa disso: como a função `SECURITY DEFINER` é criada pelas
migrations, ela pertence ao `neondb_owner` e herda o `BYPASSRLS` dele — então no
Neon o `NO FORCE` da 0027 nem precisa entrar em ação. Ele fica como garantia de
portabilidade: se um dia o dono das tabelas não tiver `BYPASSRLS`, a função
continua funcionando.

### Migrations continuam precisando de papel privilegiado

Dois motivos independentes:

- `alembic upgrade head` cria e altera política. O app não deve poder fazer isso.
- Adicionar FK a `group_members` dispara validação que avalia política. Num dono
  **sem** `BYPASSRLS` e com `FORCE`, isso falha — foi o que aconteceu no ambiente
  de verificação. No Neon não aparece, porque `neondb_owner` tem `BYPASSRLS`.

No Render isso já está separado na prática: o `alembic upgrade head` roda no
pre-deploy, e é ele que lê `DATABASE_URL`. O app lê `DATABASE_APP_URL` quando
existe.

### Procedimento da troca (Neon)

O banco é **Neon**; o backend roda no Render. `neondb_owner` é o papel
privilegiado e **tem `BYPASSRLS`** — por isso as políticas não valem para ele, e
por isso ele é o certo para migration e o errado para o app.

> **Ordem obrigatória:** o papel restrito só funciona depois que as migrations
> 0024–0028 rodaram. Setar `DATABASE_APP_URL` antes disso derruba o app — as
> políticas antigas têm os seis defeitos acima, e o login para de funcionar.
> Primeiro faça o deploy (o pre-deploy roda `alembic upgrade head`), depois sete a
> variável.

**1. Criar o papel restrito.** Rode no SQL Editor do Neon, conectado como
`neondb_owner`:

```sql
CREATE ROLE bookclub_app WITH LOGIN PASSWORD '...';

GRANT CONNECT ON DATABASE neondb TO bookclub_app;
GRANT USAGE ON SCHEMA public TO bookclub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bookclub_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bookclub_app;

-- Para as tabelas que migrations futuras criarem. Tem de ser executado por
-- `neondb_owner`: `ALTER DEFAULT PRIVILEGES` vale para objetos criados pelo
-- papel que rodou o comando, e é ele quem roda as migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bookclub_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bookclub_app;
```

Note o que **não** está aí: nenhum `SUPERUSER`, nenhum `BYPASSRLS`, nenhuma posse
de tabela. É isso que faz as políticas valerem para ele. Papel criado por SQL no
Neon também não entra em `neon_superuser` — o que vem pelo Console, API ou CLI
entra, então crie por SQL.

**2. Setar `DATABASE_APP_URL` no serviço do Render.** Só isso. `DATABASE_URL`
continua com `neondb_owner`, porque é ele que o `alembic upgrade head` do
pre-deploy usa; o app passa a preferir a `DATABASE_APP_URL` quando ela existe
(`app/db/engine.py`).

```
DATABASE_URL      = postgresql://neondb_owner:...@ep-....neon.tech/neondb   # migrations
DATABASE_APP_URL  = postgresql://bookclub_app:...@ep-....neon.tech/neondb   # app
```

Use o endpoint **pooler** na do app e o **direto** (sem `-pooler`) na de
migration — DDL não se beneficia do pooler e algumas operações se dão mal com
ele.

**3. Verificar.** Deve devolver `f`, `f`:

```sql
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'bookclub_app';
```

Depois o teste de fumaça: login, abrir um grupo, mandar uma mensagem. Se o login
falhar com "credenciais inválidas" para uma senha certa, o sintoma é RLS barrando
a busca por e-mail — confira se as 0025–0027 rodaram.

**Rollback:** remover a variável `DATABASE_APP_URL` e reiniciar. O app volta ao
`DATABASE_URL` e nada mais muda.

### Por que o pooler torna isto mais urgente, não menos

A URL do app usa o endpoint pooler do Neon, que é PgBouncer em modo transação:
uma conexão de servidor é reaproveitada por requisições de **usuários
diferentes**.

Duas consequências, e as duas já estão tratadas no código:

- O contexto de usuário **tem** de ser transaction-local (`set_config(..., true)`).
  Fosse de sessão, o `app.current_user_id` de um usuário vazaria para a
  requisição seguinte na mesma conexão de servidor — troca de identidade, não
  vazamento de leitura.
- O defeito nº 2 acima (a GUC virando `''` depois da transação) deixa de ser
  eventual e passa a ser o caso comum, porque a conexão de servidor é sempre
  reusada. Sem o `nullif` da 0026, seria erro de banco em quase toda requisição
  sem usuário no contexto.

**Rollback:** voltar o `DATABASE_URL` para o papel anterior. Nenhuma migration
precisa ser revertida; as políticas corrigidas são inertes para quem ignora RLS.
O rollback é imediato e não perde dados.

### Ainda não coberto — leia antes de trocar

A verificação rodou numa **branch do Neon** criada a partir da produção, com
dados reais, endpoint pooler e o app no papel `bookclub_app`. Cobriu: registro,
login, rota autenticada, criação de grupo, lista de membros, chat, stats,
cria/usa/revoga token, entrada por código de convite e isolamento entre dois
usuários. Tudo verde. A branch foi apagada.

O que **não** foi exercitado, e onde eu esperaria problema:

- **`populate_shelf_cache`** (`app/services/shelf.py`) — background task, roda sem
  usuário no contexto. A leitura do grupo já está coberta pela porta da 0028, mas
  `_build_shelf_data` logo depois lê `rounds` e `book_reviews`, cujas políticas são
  keyed em participação. Sob papel restrito isso falha, o `except Exception` do job
  engole, e a estante pública apenas para de atualizar. **É a pendência mais
  concreta**: degradação silenciosa, não erro visível.
- **Workers** (`app/workers/`) — mesmo padrão: sessão própria, sem usuário.
- **SSE do chat**, **export de dados** e **wrapped anual** — usam as mesmas sessões
  e políticas dos caminhos testados, mas não passaram pelo teste de fumaça.

Recomendação: depois de setar `DATABASE_APP_URL`, exercite cada um desses uma vez
e olhe o log. O rollback é remover a variável.

---

## Checklist de Deploy em Produção

- [ ] `alembic upgrade head` rodou sem erros
- [ ] Variáveis de ambiente obrigatórias presentes (ver `app/core/config.py`)
- [ ] Sentry recebendo eventos de teste
- [ ] Health check `/api/v1/health` retorna 200
- [ ] Teste de login OAuth Google funciona
- [ ] Upload de avatar funciona (valida R2 + presigned URL)
