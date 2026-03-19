import type { ChatMessage, ReactionSummary } from "@/lib/types/chat";

export function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    group_id: "g1",
    round_id: null,
    author: {
      user_id: "u1",
      username: "alice",
      display_name: "Alice",
      avatar_url: null,
    },
    content_type: "text",
    content_text: "Hello world",
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
    created_at: new Date().toISOString(),
    updated_at: null,
    is_deleted: false,
    ...overrides,
  };
}

export function makeReaction(overrides: Partial<ReactionSummary> = {}): ReactionSummary {
  return { emoji: "❤️", count: 1, did_i_react: false, ...overrides };
}
