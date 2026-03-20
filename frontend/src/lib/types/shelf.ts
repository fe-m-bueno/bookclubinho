export interface ShelfBook {
  book_title: string;
  book_author: string | null;
  book_cover_url: string | null;
  page_count: number | null;
  genres: string[];
  average_rating: number | null;
  review_count: number;
  started_at: string | null;
  finished_at: string | null;
  top_oneliners: string[];
}

export interface ShelfResponse {
  group_name: string;
  group_photo_url: string | null;
  books: ShelfBook[];
}
