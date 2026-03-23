export interface EmailNotificationPreferences {
  meetings: boolean;
  invites: boolean;
  auth: boolean;
  approaching_end: boolean;
  all_updates: boolean;
}

export interface UserMe {
  id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status_text: string | null;
  auth_provider: string;
  preferred_genres: string[];
  onboarding_completed: boolean;
  email_notifications: EmailNotificationPreferences;
  streak_current: number;
  streak_longest: number;
  streak_last_update: string | null;
  total_reading_time_minutes: number;
  timezone: string;
  auto_sync_hardcover: boolean;
  hardcover_connected: boolean;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}
