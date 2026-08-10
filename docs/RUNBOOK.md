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

### Restore de Backup (Render Postgres)

1. Acesse o painel Render → Postgres → Backups.
2. Selecione o ponto de restauração.
3. Faça o restore em um banco temporário primeiro para validar.
4. Atualize `DATABASE_URL` para apontar ao banco restaurado.
5. Execute `alembic upgrade head` para garantir que migrations estão sincronizadas.

---

## RLS: o app ainda conecta como superusuário

**Estado atual: RLS não está valendo em produção.** O app conecta com um papel
superusuário, e superusuário não avalia política — nem com `FORCE ROW LEVEL
SECURITY`. As políticas das migrations 0005 em diante são, hoje, documentação
executável. **Não troque o `DATABASE_URL` para um papel comum ainda** — leia até
o fim antes de considerar.

### O que já foi corrigido (migrations 0025 e 0026)

Quatro defeitos que só apareciam sob um papel comum, todos verificados contra um
Postgres 16 local com papel sem `BYPASSRLS`:

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

### O que ainda bloqueia a troca

**Políticas recursivas.** `group_members_select/update/delete` consultam
`group_members` dentro da própria política. Sob RLS isso é
`infinite recursion detected in policy for relation "group_members"` — erro
duro, não resultado vazio. E como 31 políticas de outras tabelas checam
participação lendo `group_members`, todas caem junto: na prática, tudo que é
grupo, chat, rodada, review e encontro para de funcionar.

A saída usual é uma função `SECURITY DEFINER` que responde "fulano é membro
deste grupo?" sem passar por RLS. O detalhe que trava: com `FORCE ROW LEVEL
SECURITY`, nem o dono da tabela escapa das políticas — então a função teria de
pertencer a um papel com `BYPASSRLS` (exige superusuário para criar) ou seria
preciso abrir mão do `FORCE` nessas tabelas. As duas opções mexem na postura de
segurança e dependem do que o Render concede no plano em uso.

### Quando for a hora, o procedimento é

```sql
CREATE ROLE bookclub_app LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA public TO bookclub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bookclub_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bookclub_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bookclub_app;
```

Depois aponte o `DATABASE_URL` do serviço para esse papel. As migrations
continuam rodando com o papel dono — `alembic upgrade head` precisa criar
políticas, e o app não deve poder fazer isso.

**Rollback:** voltar o `DATABASE_URL` para o papel anterior. Nenhuma migration
precisa ser revertida; as políticas corrigidas são inertes para quem ignora RLS.

---

## Checklist de Deploy em Produção

- [ ] `alembic upgrade head` rodou sem erros
- [ ] Variáveis de ambiente obrigatórias presentes (ver `app/core/config.py`)
- [ ] Sentry recebendo eventos de teste
- [ ] Health check `/api/v1/health` retorna 200
- [ ] Teste de login OAuth Google funciona
- [ ] Upload de avatar funciona (valida R2 + presigned URL)
