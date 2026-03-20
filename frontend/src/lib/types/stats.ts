export interface GenreBreakdown {
  genre: string;
  count: number;
}

export interface RatingDistribution {
  stars: number;
  count: number;
}

export interface EmotionalStats {
  total_reviews: number;
  cried_count: number;
  loved_it_count: number;
  felt_aroused_count: number;
  found_heavy_count: number;
  wants_more_count: number;
}

export interface MemberLeaderboardEntry {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  books_finished: number;
  avg_rating: number | null;
  current_streak: number;
  reading_time_minutes: number;
  reviews_count: number;
  badges_count: number;
}

export interface GroupStatsResponse {
  total_books_read: number;
  total_pages_read: number;
  average_rating: number | null;
  total_reading_time_minutes: number;
  books_per_genre: GenreBreakdown[];
  member_leaderboard: MemberLeaderboardEntry[];
  rating_distribution: RatingDistribution[];
  emotional_stats: EmotionalStats;
}
