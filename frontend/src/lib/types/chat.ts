import type { MessageRichContent } from "./rich-content";

export type ContentType =
  | "text"
  | "image"
  | "gif"
  | "video_link"
  | "quote"
  | "chapter_marker"
  | "page_marker"
  | "system";

export interface MessageAuthor {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  did_i_react: boolean;
}

export interface ChatMessage {
  id: string;
  group_id: string;
  round_id: string | null;
  author: MessageAuthor;
  content_type: ContentType;
  content_text: string | null;
  content_rich_json: MessageRichContent | null;
  media_url: string | null;
  thumbnail_url: string | null;
  reference_type: "chapter" | "page" | "quote" | null;
  reference_value: string | null;
  is_spoiler: boolean;
  spoiler_chapter: number | null;
  parent_message_id: string | null;
  reply_count: number;
  reactions: ReactionSummary[];
  created_at: string;
  updated_at: string | null;
  is_deleted: boolean;
}

export interface MessageListResponse {
  messages: ChatMessage[];
  next_cursor: string | null;
}

export interface MessageCreatePayload {
  content_type: ContentType;
  content_text?: string | null;
  content_rich_json?: MessageRichContent | null;
  /** Chave do objeto devolvida pelo upload — é o que o backend persiste. */
  media_key?: string | null;
  thumbnail_key?: string | null;
  /** Só para video_link: link externo. Imagens não aceitam URL do cliente. */
  media_url?: string | null;
  /**
   * URL presigned do upload, usada só no preview otimista local.
   * Não vai no request — o backend resolve a URL a partir da chave.
   */
  previewUrl?: string | null;
  reference_type?: "chapter" | "page" | "quote" | null;
  reference_value?: string | null;
  is_spoiler?: boolean;
  spoiler_chapter?: number | null;
  parent_message_id?: string | null;
  round_id?: string | null;
}

export interface MessageEditPayload {
  content_text?: string | null;
  content_rich_json?: MessageRichContent | null;
}

export interface ReactionPayload {
  emoji: string;
}

export interface MediaUploadResponse {
  media_key: string;
  thumbnail_key: string;
  /** Presigned, expira em 1h — serve para preview imediato, não para guardar. */
  media_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
}

export interface ReactionDetail {
  id: string;
  emoji: string;
  user_id: string;
  username: string;
  display_name: string | null;
  created_at: string;
}

export interface TypingUser {
  userId: string;
  displayName: string;
  avatarUrl: string;
}

export type ChatSSEEvent =
  | { type: "message_created"; message_id: string; user_id: string }
  | { type: "message_edited"; message_id: string; user_id: string }
  | { type: "message_deleted"; message_id: string; user_id: string }
  | { type: "reaction_added"; message_id: string; user_id: string; emoji: string }
  | { type: "reaction_removed"; message_id: string; user_id: string; emoji: string }
  | { type: "user_typing"; user_id: string; display_name: string; avatar_url: string };
