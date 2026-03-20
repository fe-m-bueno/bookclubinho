export type RoundStatus =
  | "nominating"
  | "voting"
  | "reading"
  | "reviewing"
  | "finished";

export interface RoundSummary {
  id: string;
  round_number: number;
  status: RoundStatus;
  book_title: string | null;
  book_author: string | null;
  book_cover_url: string | null;
  book_page_count: number | null;
}

export interface MyReadingProgress {
  current_page: number | null;
  total_pages: number | null;
  percentage: number;
}

export interface LastMessagePreview {
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  content_text: string | null;
  content_type: string;
  created_at: string;
}

export interface MemberAvatar {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface GroupListItem {
  id: string;
  name: string;
  photo_url: string | null;
  member_count: number;
  members_preview: MemberAvatar[];
  current_round: RoundSummary | null;
  my_reading_progress: MyReadingProgress | null;
  last_message_preview: LastMessagePreview | null;
  last_activity_at: string | null;
}

export interface GroupListResponse {
  groups: GroupListItem[];
}

export interface GroupCreateResponse {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  invite_code: string;
  created_at: string;
}

export interface MemberSummary {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
  joined_at: string;
}

export interface GroupDetailResponse {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  invite_code: string | null;
  max_members: number;
  member_count: number;
  members: MemberSummary[];
  current_user_id: string;
  current_round: null;
  created_at: string;
}

export interface MemberRoleUpdateResponse {
  user_id: string;
  role: "admin" | "member";
  message: string;
}
