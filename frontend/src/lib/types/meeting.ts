export type MeetingType = "in_person" | "virtual" | "hybrid";
export type RsvpStatus = "going" | "maybe" | "not_going" | "pending";

export interface RsvpSummary {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: RsvpStatus;
  responded_at: string | null;
}

export interface MeetingResponse {
  id: string;
  group_id: string;
  round_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  meeting_type: MeetingType;
  virtual_link: string | null;
  scheduled_at: string;
  duration_minutes: number;
  created_by: string;
  creator_username: string;
  rsvps: RsvpSummary[];
  rsvp_counts: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface MeetingListItem {
  id: string;
  group_id: string;
  round_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  meeting_type: MeetingType;
  virtual_link: string | null;
  scheduled_at: string;
  duration_minutes: number;
  created_by: string;
  creator_username: string;
  rsvp_counts: Record<string, number>;
  my_rsvp_status: RsvpStatus | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingListResponse {
  meetings: MeetingListItem[];
  next_cursor: string | null;
}

export interface MeetingCreatePayload {
  title: string;
  description?: string | null;
  location?: string | null;
  meeting_type: MeetingType;
  virtual_link?: string | null;
  scheduled_at: string;
  duration_minutes: number;
  round_id?: string | null;
}

export interface UpcomingMeetingItem {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  meeting_type: MeetingType;
  group_id: string;
  group_name: string;
  group_photo_url: string | null;
  my_rsvp_status: string | null;
}

export interface UpcomingMeetingsResponse {
  meetings: UpcomingMeetingItem[];
}

/** Generate Google Calendar URL client-side from meeting data. */
export function buildGoogleCalendarUrl(meeting: {
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  location?: string | null;
  virtual_link?: string | null;
  description?: string | null;
}): string {
  const start = new Date(meeting.scheduled_at);
  const end = new Date(start.getTime() + meeting.duration_minutes * 60_000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const location = meeting.location || meeting.virtual_link || "";
  const description = meeting.description || "";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: meeting.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: description,
    location,
  });
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}
