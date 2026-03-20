export interface MemberInfo {
  user_id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface MemberSuperlative {
  user_id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  title: string;
  emoji: string;
  stat_label: string;
  stat_value: string;
}

export interface HighestRatedBook {
  title: string;
  cover_url?: string | null;
  author?: string | null;
  avg_rating: number;
}

export interface FunniestOneliner {
  text: string;
  author_username: string;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
  vote_count: number;
}

export interface MostEmotionalBook {
  title: string;
  cover_url?: string | null;
  author?: string | null;
  cried_percentage: number;
}

export interface GenreBreakdownItem {
  genre: string;
  count: number;
  percentage: number;
}

export interface EmotionalStats {
  total_reviews: number;
  cried_count: number;
  loved_it_count: number;
  felt_aroused_count: number;
  found_heavy_count: number;
  wants_more_count: number;
}

export interface WrappedData {
  year: number;
  group_name: string;
  group_photo_url?: string | null;
  total_books_read: number;
  total_pages: number;
  total_reading_hours: number;
  genre_breakdown: GenreBreakdownItem[];
  highest_rated_book?: HighestRatedBook | null;
  most_active_member?: MemberInfo | null;
  longest_streak_member?: MemberInfo | null;
  funniest_oneliner?: FunniestOneliner | null;
  most_emotional_book?: MostEmotionalBook | null;
  member_superlatives: MemberSuperlative[];
  emotional_stats: EmotionalStats;
  member_avatars: MemberInfo[];
}

export interface WrappedResponse {
  group_id: string;
  year: number;
  data: WrappedData;
  generated_at: string;
  generated_by: string;
}
