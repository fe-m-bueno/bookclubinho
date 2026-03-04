# Product & Goals — Visão do Produto

## O que é o bookclub?

O Bookclub é uma webapp social de clube do livro — feita pra grupos pequenos de amigos que gostam de ler juntos, discutir livros e transformar a leitura num ritual compartilhado.

Não é uma plataforma pública de reviews tipo Goodreads. Não é um app de leitura individual. É um espaço fechado pra um grupo específico de pessoas que se importam com o que cada um está lendo — e quer falar sobre isso.

---

## O problema que a gente resolve

Clubes do livro existem há décadas, mas a experiência digital deles ainda é um caos. Os grupos usam: um grupo de WhatsApp sem estrutura, uma planilha pra registrar quem leu o quê, um formulário do Google pra votação, um Zoom pra reunir os membros.

É uma colagem de ferramentas que nunca foram feitas pra trabalhar juntas. O resultado: rituais que deveriam ser divertidos viram fricção. O Bookclub resolve isso num só lugar.

---

## Visão do produto

Um app com a personalidade de um grupo de amigos leitores e a fluidez de um app de mensagens moderno.

A referência estética e funcional do chat é o iMessage — bolhas, agrupamento de mensagens, reações com emoji, typing indicators. A referência de gamificação é o Spotify Wrapped e o Duolingo — streaks, badges, revelação dramática, celebração coletiva.

A paleta é quente e acolhedora: `#F8DFBF` (warm sand) no light mode, `#30261D` (deep brown) no dark mode. Não é mais um app branco/cinza sem alma.

---

## Quem usa

Usuário primário: grupos de 3 a 8 amigos adultos que já têm um clube do livro informal — ou queriam ter um mas desistiram da fricção logística.

Perfil: leitores que usam apps sociais modernos, não têm problema com tecnologia, mas também não querem configurar nada. Querem entrar, ver o livro da rodada, registrar que leram 40 páginas hoje, e mandar uma mensagem no chat. Em menos de 30 segundos.

---

## Features principais

### Rodadas e votação de livros
Cada ciclo do clube é uma rodada. Os membros indicam livros com um pitch opcional de 280 chars, votam com 1 voto por pessoa, e o resultado é revelado com animação dramática. Em caso de empate, o destino decide — e o app deixa isso claro com personalidade. A busca de livros usa a Hardcover API (GraphQL) — metadados ricos, capas, autores, contagem de páginas.

### Chat estilo iMessage
Um chat rico dentro de cada grupo, com suporte a texto formatado via Tiptap, imagens, GIFs, embeds do X/Twitter, marcadores de capítulo e página (que também registram progresso), quotes com referência de página (vão pro Hall of Quotes), spoilers com blur automático baseado no progresso do leitor, reações com emoji e typing indicators. Realtime via SSE (Server-Sent Events) sobre Redis Streams.

### Tracking de progresso e streaks
O usuário registra progresso por página, capítulo ou porcentagem. O app calcula streaks diários globais e reseta automaticamente se passar um dia sem leitura. Milestones (7, 14, 30, 60, 100 dias) desbloqueiam badges e celebrações. Um timer de leitura flutuante registra sessões ativas com cronômetro visível que persiste entre navegação de páginas.

### Reviews com personalidade
Ao terminar o livro, o membro preenche uma review em 6 passos: nota de 0 a 5 estrelas, perguntas binárias divertidas (chorou? ficou com tesão? achou pesado?), review sincero e one-liner engraçado. As reviews ficam bloqueadas até você enviar a sua — pra não contaminar a opinião de quem ainda não terminou.

### Gamificação completa
14 badges com condições variadas: speed reader, crybaby, hot take, night owl, founder e outros. Hall of Quotes com votação das melhores frases do grupo num layout estilo Pinterest. Leaderboard por grupo (livros lidos, média de notas, streak, tempo de leitura). Stats agregados: gêneros, rating distribution, "63% do grupo chorou".

### Wrapped anual
Uma experiência estilo Instagram Stories / Spotify Wrapped — slides animados com os highlights do ano do grupo. Cada slide é compartilhável como imagem. Gerado sob demanda, regenerável.

### Encontros
Agendamento de encontros presenciais, virtuais ou híbridos, com RSVP (Vou / Talvez / Não vou), integração com Google Calendar via link pré-preenchido e export .ics pra qualquer app de calendário.

### Notificações por email
Transacionais via Resend: magic link, lembretes de encontro 24h e 1h antes, alerta de quase-fim quando alguém passa de 80%, digest de posts, badge ganho, wrapped pronto. Tudo configurável por preferência do usuário.

---

## O que o produto NÃO é

- Não é uma rede social pública — sem feeds, followers, ou descoberta de grupos estranhos.
- Não é um app de leitura individual — sem biblioteca pessoal ou wishlist.
- Não é um clone do Goodreads — sem reviews públicas nem ratings pra exibição externa.
- Não é pra grupos grandes — limite de 8 membros por design, pra manter a intimidade.

---

## Goals do produto

### Goal 1 — Reduzir a fricção de manter um clube ativo
**Métrica:** % de grupos que completam pelo menos 3 rodadas nos primeiros 6 meses.

O maior problema de clubes do livro é a desistência. A votação some no WhatsApp, ninguém lembra quem tá em qual página, o encontro não é agendado. O Bookclub torna esses rituais naturais e automáticos — a rodada fica visível, o progresso é público dentro do grupo, o encontro tem lembrete.

### Goal 2 — Criar um senso de pertencimento e identidade coletiva
**Métrica:** % de membros que voltam ao app pelo menos 3x por semana durante uma rodada ativa.

O wrapped anual, os badges, o hall of quotes, as stats do grupo — são todos mecanismos pra que o grupo sinta que tem uma história em comum. "Nosso grupo leu 14 livros em 2024 e 71% chorou no terceiro" é uma identidade.

### Goal 3 — Tornar a review o momento mais divertido do ciclo
**Métrica:** % de membros que submetem review após terminar o livro. Target: mais de 85%.

Reviews em plataformas tradicionais são trabalho. No Bookclub, é uma mini-cerimônia — perguntas engraçadas, one-liner pra zoar o grupo, revelação coletiva. O formato tem personalidade pra encorajar participação mesmo de quem não gosta de escrever.

### Goal 4 — Manter streaks como hábito, não como ansiedade
**Métrica:** streak médio dos membros ativos. % de usuários com streak maior que 7 dias.

Streaks existem pra criar consistência, não culpa. O design intencional: o app nunca envia notificação de "sua streak vai quebrar" — só celebra quando você registra. A streak quebrou? Recomeça do 1 sem drama.

### Goal 5 — Zero atrito no setup
**Métrica:** tempo médio do cadastro até a primeira mensagem enviada no chat de um grupo.

Onboarding em 3 passos: perfil, gêneros, entrar ou criar grupo. Magic link pra não precisar lembrar senha. Código de convite de 8 caracteres com QR code. Ninguém deveria precisar de tutorial pra começar.
