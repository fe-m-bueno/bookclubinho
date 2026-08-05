# Contexto do domínio

Glossário do bookclubinho. Cada termo é definido como o código o usa — quando um
nome aqui e um nome no código discordam, um dos dois está errado e vale arrumar.

Criado sob demanda: entradas nascem quando um termo precisa ser resolvido de
verdade, não como inventário antecipado. Decisões que vale não re-litigar vão
para `docs/adr/`.

---

## Membership

O fato de um usuário pertencer a um **Group**, e com qual **role** (`admin` ou
`member`). É a pergunta de autorização mais frequente do app: praticamente toda
rota de clube começa respondendo ela.

Membership tem três propriedades que o código trata como inseparáveis:

1. **Existe uma linha de `GroupMember`** ligando usuário e clube.
2. **O clube está ativo** (`Group.is_active`). Clube soft-deleted não tem
   membros para efeito de acesso, embora as linhas de `GroupMember` continuem na
   tabela — `soft_delete_group` só vira a flag.
3. **A role satisfaz o que a operação exige**, quando ela exige algo.

Não pertencer e o clube não existir são **indistinguíveis de fora**: os dois dão
404, nunca 403, para que a resposta não revele que o clube existe. O 403 só
aparece depois que o pertencimento já foi estabelecido, quando a role não basta —
aí não há mais nada a esconder.

`app/services/membership.py` é o único lugar que responde a pergunta.
`app/core/deps.py` a expõe como dependency do FastAPI para rotas com `group_id`
no path; os services chamam `resolve` direto. Os dois são adapters do mesmo seam.

**Não confundir com:**

- **estar no clube** no sentido de contagem — o limite de 8 membros olha
  `len(group.members)`, sem passar por membership.
- **autoria** — ser autor de uma mensagem é outra coisa. As duas são necessárias:
  editar uma mensagem exige membership *e* autoria.

Ver: [[Group]], [[GroupMember]] no modelo de domínio do `CLAUDE.md`.

---

## Terminar o livro

Um leitor terminou o livro quando existe um snapshot de **ReadingProgress** com
`progress_type = "finished"` para ele naquela rodada. É um fato por leitor, não
por rodada — cada um termina no seu tempo.

Há **dois caminhos** para isso acontecer, e ambos contam igual:

1. registrar progresso em 100% (pelo timer ou pelo formulário de página);
2. **submeter a review** — enviar review é, por si, dizer que terminou.

Terminar tem consequências, e elas são inseparáveis do fato: o streak do dia
sobe, os eventos de SSE saem para o clube, e os badges de `book_finished`
(`first_blood`, `speed_reader`, `bookworm`, `variety`) são reavaliados. Por isso
ninguém escreve `ReadingProgress` na mão — os dois caminhos atravessam
`app/services/reading_progress.py`, que é dono do fato e das consequências.

**Não confundir com encerrar a rodada.** Encerrar é ação de admin, muda o status
da **Round** para `finished`, e exige que exista pelo menos uma review. Um leitor
pode ter terminado o livro numa rodada que ainda está aberta; e a rodada pode ser
encerrada com membros que nunca terminaram.

Ver: [[Round]], [[ReadingProgress]] no modelo de domínio do `CLAUDE.md`.
