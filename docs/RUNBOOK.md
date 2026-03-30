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

## Checklist de Deploy em Produção

- [ ] `alembic upgrade head` rodou sem erros
- [ ] Variáveis de ambiente obrigatórias presentes (ver `app/core/config.py`)
- [ ] Sentry recebendo eventos de teste
- [ ] Health check `/api/v1/health` retorna 200
- [ ] Teste de login OAuth Google funciona
- [ ] Upload de avatar funciona (valida R2 + presigned URL)
