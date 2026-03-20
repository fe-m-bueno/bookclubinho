export interface BadgeSummary {
  slug: string;
  emoji: string | null;
}

export interface PublicProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status_text: string | null;
  preferred_genres: string[];
  streak_current: number;
  streak_longest: number;
  total_reading_time_minutes: number;
  timezone: string;
  is_active: boolean;
  created_at: string;
  total_books_finished: number;
  badges: BadgeSummary[];
  shared_group_count: number;
}

export interface SharedGroup {
  id: string;
  name: string;
  photo_url: string | null;
  member_count: number;
}
