import { create } from "zustand";

interface ReplyTo {
  id: string;
  authorName: string;
  preview: string;
}

interface EditingMessage {
  id: string;
  content_text: string | null;
  content_rich_json: Record<string, unknown> | null;
}

export interface TypingUser {
  displayName: string;
  avatarUrl: string;
  lastTypingAt: number;
}

interface ChatState {
  chapterFilter: number | null;
  replyTo: ReplyTo | null;
  isAtBottom: boolean;
  unreadCount: number;
  revealedSpoilers: Set<string>;
  uploadProgress: number | null;
  editingMessage: EditingMessage | null;
  typingUsers: Map<string, TypingUser>;

  setChapterFilter: (chapter: number | null) => void;
  setReplyTo: (reply: ReplyTo | null) => void;
  setIsAtBottom: (val: boolean) => void;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  revealSpoiler: (messageId: string) => void;
  isSpoilerRevealed: (messageId: string) => boolean;
  setUploadProgress: (progress: number | null) => void;
  setEditingMessage: (msg: EditingMessage | null) => void;
  setTypingUser: (userId: string, user: TypingUser) => void;
  removeTypingUser: (userId: string) => void;
  clearTypingUsers: () => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  chapterFilter: null,
  replyTo: null,
  isAtBottom: true,
  unreadCount: 0,
  revealedSpoilers: new Set<string>(),
  uploadProgress: null,
  editingMessage: null,
  typingUsers: new Map<string, TypingUser>(),

  setChapterFilter: (chapter) => set({ chapterFilter: chapter }),
  setReplyTo: (reply) => set({ replyTo: reply }),
  setIsAtBottom: (val) => set({ isAtBottom: val }),
  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  revealSpoiler: (messageId) => {
    const next = new Set(get().revealedSpoilers);
    next.add(messageId);
    set({ revealedSpoilers: next });
  },
  isSpoilerRevealed: (messageId) => get().revealedSpoilers.has(messageId),
  setUploadProgress: (progress) => set({ uploadProgress: progress }),
  setEditingMessage: (msg) => set({ editingMessage: msg }),
  setTypingUser: (userId, user) => {
    const next = new Map(get().typingUsers);
    next.set(userId, user);
    set({ typingUsers: next });
  },
  removeTypingUser: (userId) => {
    const next = new Map(get().typingUsers);
    next.delete(userId);
    set({ typingUsers: next });
  },
  clearTypingUsers: () => set({ typingUsers: new Map() }),
  reset: () =>
    set({
      chapterFilter: null,
      replyTo: null,
      isAtBottom: true,
      unreadCount: 0,
      revealedSpoilers: new Set(),
      uploadProgress: null,
      editingMessage: null,
      typingUsers: new Map(),
    }),
}));
