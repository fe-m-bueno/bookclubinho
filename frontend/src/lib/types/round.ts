export type RoundStatus =
  | "nominating"
  | "voting"
  | "reading"
  | "reviewing"
  | "finished";

export interface NominationSummary {
  id: string;
  book_id: string;
  book_title: string;
  book_author: string | null;
  book_cover_url: string | null;
  book_hardcover_slug: string | null;
  book_page_count: number | null;
  pitch: string | null;
  user_id: string;
  nominated_at: string;
  vote_count: number;
}

export interface BookSummary {
  book_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  page_count: number | null;
}

export interface FinalizeResponse {
  book: BookSummary;
  was_tiebreak: boolean;
}

export interface TiebreakInfo {
  was_tiebreak: boolean;
  tied_nominations: { id: string; title: string; votes: number }[];
  winner_id: string;
  method?: "random";
}

export interface RoundDetailResponse {
  id: string;
  round_number: number;
  book_id: string | null;
  book_title: string | null;
  book_author: string | null;
  book_cover_url: string | null;
  book_page_count: number | null;
  status: RoundStatus;
  deadline: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  nominations: NominationSummary[];
  tiebreak_info: TiebreakInfo | null;
}

export interface NominationCreatePayload {
  book_id: string;
  book_title: string;
  book_author: string | null;
  book_cover_url: string | null;
  book_hardcover_slug: string | null;
  book_page_count: number | null;
  pitch?: string;
}
