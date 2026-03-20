export interface QuoteResponse {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  quote_text: string;
  page_reference: string | null;
  book_title: string;
  book_author: string | null;
  round_id: string | null;
  vote_count: number;
  did_i_vote: boolean;
  created_at: string; // ISO datetime
}

export interface QuoteListResponse {
  quotes: QuoteResponse[];
  next_cursor: string | null;
}

export interface QuoteCreateRequest {
  quote_text: string;
  page_reference?: string | null;
  round_id?: string | null;
}
