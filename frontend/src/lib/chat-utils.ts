import type { MessageAuthor } from "@/lib/types/chat";

export function getAuthorName(author: MessageAuthor): string {
  return author.display_name ?? author.username;
}

export function getAuthorInitials(author: MessageAuthor): string {
  return getAuthorName(author).slice(0, 2).toUpperCase();
}
