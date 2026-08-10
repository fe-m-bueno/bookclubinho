import type { ChatMessage } from "@/lib/types/chat";
import type { GroupListItem } from "@/lib/types/group";
import type { UpcomingMeetingItem } from "@/lib/types/meeting";
import type { NominationSummary } from "@/lib/types/round";
import type { UserMe } from "@/lib/types/user";

/**
 * O clube de mentira que a /about mostra.
 *
 * As fixtures são tipadas com os tipos de produção de propósito: a /about
 * renderiza os componentes de verdade, então uma mudança de contrato em
 * `GroupListItem` ou `ChatMessage` tem que quebrar o build aqui, e não a
 * página em silêncio depois do deploy.
 *
 * Datas são literais fixos, e não `new Date()`: a página é estática, e um
 * "há 3 minutos" calculado no build viraria "há 4 meses" sem ninguém notar.
 * O que o leitor precisa ver é a forma da tela, não o relógio.
 *
 * As capas são SVG local em `public/about/`. Capa de verdade viria da
 * Hardcover, e um livro real numa página de exemplo é atribuição que ninguém
 * pediu — além de virar link quebrado quando a licença da imagem mudar.
 */

const MEMBROS = {
  ana: {
    user_id: "about-ana",
    username: "ana",
    display_name: "Ana",
    avatar_url: null,
  },
  bruno: {
    user_id: "about-bruno",
    username: "bruno",
    display_name: "Bruno",
    avatar_url: null,
  },
  clara: {
    user_id: "about-clara",
    username: "clara",
    display_name: "Clara",
    avatar_url: null,
  },
} as const;

/**
 * Quem está olhando a /about não é nenhum dos três. É o que faz o spoiler
 * aparecer borrado: `SpoilerOverlay` revela direto para o próprio autor.
 */
export const VISITANTE_ID = "about-visitante";

export const CLUBE_LENDO: GroupListItem = {
  id: "about-clube",
  name: "Clube da Meia-Noite",
  photo_url: null,
  member_count: 5,
  members_preview: [MEMBROS.ana, MEMBROS.bruno, MEMBROS.clara],
  current_round: {
    id: "about-rodada",
    round_number: 4,
    status: "reading",
    book_title: "A Casa das Marés",
    book_author: "Clara Ribeiro",
    book_cover_url: "/about/capa-mares.svg",
    book_page_count: 328,
    // Sem prazo, e não com uma data futura: qualquer data escrita aqui vira
    // passado, e o card passaria a anunciar "atrasada" em vermelho na página
    // que explica o produto. O prazo está no texto da seção, onde não vence.
    deadline: null,
    needs_my_action: false,
  },
  my_reading_progress: {
    current_page: 214,
    total_pages: 328,
    percentage: 65,
  },
  last_message_preview: {
    sender_display_name: "Ana",
    sender_avatar_url: null,
    content_text: "o capítulo 12 me destruiu",
    content_type: "text",
    created_at: "2026-08-09T21:12:00Z",
  },
  last_activity_at: "2026-08-09T21:12:00Z",
};

export const INDICACOES: NominationSummary[] = [
  {
    id: "about-indicacao-1",
    book_id: "about-livro-1",
    book_title: "Cartas ao Vento",
    book_author: "Teresa Lobo",
    book_cover_url: "/about/capa-cartas.svg",
    book_hardcover_slug: null,
    book_page_count: 244,
    pitch: "Curtinho, e a Teresa escreve como quem conta segredo.",
    user_id: MEMBROS.bruno.user_id,
    nominated_at: "2026-08-02T14:00:00Z",
    vote_count: 3,
  },
  {
    id: "about-indicacao-2",
    book_id: "about-livro-2",
    book_title: "O Jardim de Inverno",
    book_author: "M. Azevedo",
    book_cover_url: "/about/capa-jardim.svg",
    book_hardcover_slug: null,
    book_page_count: 412,
    pitch: null,
    user_id: MEMBROS.clara.user_id,
    nominated_at: "2026-08-02T16:30:00Z",
    vote_count: 1,
  },
];

export const NOMINADORES: Record<string, string> = {
  [MEMBROS.bruno.user_id]: "Bruno",
  [MEMBROS.clara.user_id]: "Clara",
};

function mensagem(
  id: string,
  autor: (typeof MEMBROS)[keyof typeof MEMBROS],
  campos: Partial<ChatMessage>,
): ChatMessage {
  return {
    id,
    group_id: CLUBE_LENDO.id,
    round_id: "about-rodada",
    author: { ...autor },
    content_type: "text",
    content_text: null,
    content_rich_json: null,
    media_url: null,
    thumbnail_url: null,
    reference_type: null,
    reference_value: null,
    is_spoiler: false,
    spoiler_chapter: null,
    parent_message_id: null,
    reply_count: 0,
    reactions: [],
    created_at: "2026-08-09T21:10:00Z",
    updated_at: null,
    is_deleted: false,
    ...campos,
  };
}

/**
 * Sem URL em nenhum texto: `MessageContent` monta um `LinkPreviewCard` para
 * cada link, e cada card desses busca no backend. Numa página pública e
 * estática isso seria uma requisição por visita para ilustrar uma conversa
 * que não existe.
 */
export const CONVERSA: ChatMessage[] = [
  mensagem("about-msg-1", MEMBROS.ana, {
    content_text: "cheguei no 12. alguém mais?",
    created_at: "2026-08-09T21:10:00Z",
  }),
  // Duas seguidas da mesma pessoa: é o que mostra o bloco — nome no topo,
  // avatar e horário só no fim.
  mensagem("about-msg-1b", MEMBROS.ana, {
    content_text: "esse livro não tem direito",
    created_at: "2026-08-09T21:10:40Z",
  }),
  mensagem("about-msg-2", MEMBROS.bruno, {
    content_type: "chapter_marker",
    reference_type: "chapter",
    reference_value: "12",
    content_text: "terminei o capítulo 12",
    created_at: "2026-08-09T21:11:00Z",
  }),
  mensagem("about-msg-3", MEMBROS.clara, {
    content_text: "a carta no fim do 14 explica tudo o que ela escondeu",
    is_spoiler: true,
    spoiler_chapter: 14,
    created_at: "2026-08-09T21:12:00Z",
  }),
];

export const LEITOR: UserMe = {
  id: VISITANTE_ID,
  email: "voce@exemplo.com",
  username: "voce",
  display_name: "Você",
  avatar_url: null,
  status_text: null,
  auth_provider: "email",
  preferred_genres: [],
  onboarding_completed: true,
  email_notifications: {
    meetings: true,
    invites: true,
    auth: true,
    approaching_end: true,
    all_updates: false,
  },
  streak_current: 12,
  streak_longest: 31,
  streak_last_update: "2026-08-09",
  total_reading_time_minutes: 1460,
  timezone: "America/Sao_Paulo",
  auto_sync_hardcover: false,
  hardcover_connected: false,
  is_active: true,
  last_login_at: "2026-08-09T21:00:00Z",
  created_at: "2026-01-08T12:00:00Z",
  updated_at: "2026-08-09T21:00:00Z",
};

export const ENCONTRO: UpcomingMeetingItem = {
  id: "about-encontro",
  group_id: CLUBE_LENDO.id,
  group_name: CLUBE_LENDO.name,
  group_photo_url: null,
  title: "Discussão da segunda metade",
  scheduled_at: "2026-09-18T22:00:00Z",
  duration_minutes: 60,
  meeting_type: "virtual",
  my_rsvp_status: "going",
};
