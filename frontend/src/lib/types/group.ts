export interface GroupCreateResponse {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  invite_code: string;
  created_at: string;
}
