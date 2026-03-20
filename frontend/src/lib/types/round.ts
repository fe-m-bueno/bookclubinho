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

export interface MemberProgressSummary {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  streak_current: number;
  current_page: number | null;
  total_pages: number | null;
  percentage: number;
  is_finished: boolean;
  note: string | null;
  updated_at: string | null;
}

export interface GroupProgressResponse {
  progress: MemberProgressSummary[];
  round_started_at: string | null;
}

export interface ReadingSessionResponse {
  id: string;
  user_id: string;
  round_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  created_at: string;
}

export interface SessionListResponse {
  sessions: ReadingSessionResponse[];
  total_duration_minutes: number;
  next_cursor: string | null;
}

export interface ProgressResponse {
  id: string;
  user_id: string;
  current_page: number | null;
  percentage: number;
  is_finished: boolean;
  created_at: string;
}

export interface ReviewUserSummary {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ReviewResponse {
  id: string;
  round_id: string;
  user_id: string;
  star_rating: number;
  cried: boolean;
  loved_it: boolean;
  felt_aroused: boolean;
  found_heavy: boolean;
  wants_more_from_author: boolean;
  sincere_review: string;
  funny_oneliner: string | null;
  extra_thoughts: string | null;
  completed_at: string;
  created_at: string;
  user: ReviewUserSummary;
}

export interface ReviewStatsResponse {
  total_reviews: number;
  avg_star_rating: number;
  cried_count: number;
  loved_it_count: number;
  felt_aroused_count: number;
  found_heavy_count: number;
  wants_more_count: number;
}
