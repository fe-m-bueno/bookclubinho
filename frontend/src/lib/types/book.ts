export interface BookResult {
  book_id: string;
  title: string;
  author: string;
  cover_url: string | null;
  slug: string;
  description: string | null;
  page_count: number | null;
}

export interface BookDetail extends BookResult {
  genres: string[];
}
