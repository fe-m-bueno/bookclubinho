export interface SessionItem {
  id: string;
  device_info: string | null;
  ip_address: string | null;
  last_active_at: string;
  created_at: string;
  is_current: boolean;
}

export interface SessionListResponse {
  sessions: SessionItem[];
}
