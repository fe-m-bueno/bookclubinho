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
