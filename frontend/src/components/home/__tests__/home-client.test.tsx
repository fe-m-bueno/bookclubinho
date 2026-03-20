import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HomeClient } from "../home-client";
import type { UserMe } from "@/lib/types/user";
import type { GroupListItem } from "@/lib/types/group";
import type { UpcomingMeetingItem } from "@/lib/types/meeting";
import type { BadgeResponse } from "@/lib/types/badge";

// Mock child components
vi.mock("../home-skeleton", () => ({
  HomeSkeleton: () => <div data-testid="skeleton" />,
}));

vi.mock("../home-empty-state", () => ({
  HomeEmptyState: ({ onCreateGroup, onJoinGroup }: { onCreateGroup: () => void; onJoinGroup: () => void }) => (
    <div data-testid="empty-state">
      <button onClick={onCreateGroup}>Criar clube</button>
      <button onClick={onJoinGroup}>Entrar</button>
    </div>
  ),
}));

vi.mock("../user-menu", () => ({
  UserMenu: ({ user }: { user: UserMe }) => (
    <div data-testid="user-menu">{user.display_name}</div>
  ),
}));

vi.mock("../group-home-card", () => ({
  GroupHomeCard: ({ group }: { group: GroupListItem }) => (
    <div data-testid="group-card">{group.name}</div>
  ),
}));

vi.mock("../upcoming-meeting-pill", () => ({
  UpcomingMeetingPill: ({ meeting }: { meeting: UpcomingMeetingItem }) => (
    <div data-testid="meeting-pill">{meeting.title}</div>
  ),
}));

vi.mock("../recent-badge-card", () => ({
  RecentBadgeCard: ({ badge }: { badge: BadgeResponse }) => (
    <div data-testid="badge-card">{badge.name}</div>
  ),
}));

vi.mock("../speed-dial-fab", () => ({
  SpeedDialFAB: () => <div data-testid="speed-dial" />,
}));

vi.mock("../join-group-dialog", () => ({
  JoinGroupDialog: () => null,
}));

// Mock all hooks
vi.mock("@/hooks/use-current-user");
vi.mock("@/hooks/use-home-groups");
vi.mock("@/hooks/use-upcoming-meetings");
vi.mock("@/hooks/use-recent-badges");

import { useCurrentUser } from "@/hooks/use-current-user";
import { useHomeGroups } from "@/hooks/use-home-groups";
import { useUpcomingMeetings } from "@/hooks/use-upcoming-meetings";
import { useRecentBadges } from "@/hooks/use-recent-badges";

const mockUser: UserMe = {
  id: "u1",
  email: "test@test.com",
  username: "testuser",
  display_name: "Maria Silva",
  avatar_url: null,
  status_text: null,
  auth_provider: "local",
  preferred_genres: [],
  onboarding_completed: true,
  email_notifications: {},
  streak_current: 3,
  streak_longest: 10,
  streak_last_update: null,
  total_reading_time_minutes: 120,
  timezone: "America/Sao_Paulo",
  is_active: true,
  last_login_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockGroup: GroupListItem = {
  id: "g1",
  name: "Clube Literário",
  photo_url: null,
  member_count: 3,
  members_preview: [],
  current_round: null,
  my_reading_progress: null,
  last_message_preview: null,
  last_activity_at: null,
};

function setMocks({
  userLoading = false,
  groupsLoading = false,
  groups = [] as GroupListItem[],
  meetings = [] as UpcomingMeetingItem[],
  badges = [] as BadgeResponse[],
} = {}) {
  vi.mocked(useCurrentUser).mockReturnValue({
    data: userLoading ? undefined : mockUser,
    isLoading: userLoading,
    isSuccess: !userLoading,
    isError: false,
    error: null,
  } as ReturnType<typeof useCurrentUser>);

  vi.mocked(useHomeGroups).mockReturnValue({
    data: groupsLoading ? undefined : { groups },
    isLoading: groupsLoading,
    isSuccess: !groupsLoading,
    isError: false,
    error: null,
  } as ReturnType<typeof useHomeGroups>);

  vi.mocked(useUpcomingMeetings).mockReturnValue({
    data: { meetings },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  } as ReturnType<typeof useUpcomingMeetings>);

  vi.mocked(useRecentBadges).mockReturnValue({
    data: { badges },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  } as ReturnType<typeof useRecentBadges>);
}

describe("HomeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton while loading", () => {
    setMocks({ userLoading: true });
    render(<HomeClient />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("shows empty state when no groups", () => {
    setMocks({ groups: [] });
    render(<HomeClient />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders group cards when groups exist", () => {
    setMocks({ groups: [mockGroup] });
    render(<HomeClient />);
    expect(screen.getByTestId("group-card")).toBeInTheDocument();
    expect(screen.getByText("Clube Literário")).toBeInTheDocument();
  });

  it("hides meetings section when empty", () => {
    setMocks({ groups: [mockGroup], meetings: [] });
    render(<HomeClient />);
    expect(screen.queryByText("Próximos encontros")).not.toBeInTheDocument();
  });

  it("shows meetings when available", () => {
    const meeting: UpcomingMeetingItem = {
      id: "m1",
      title: "Encontro mensal",
      scheduled_at: new Date().toISOString(),
      duration_minutes: 60,
      meeting_type: "in_person",
      group_id: "g1",
      group_name: "Clube Literário",
      group_photo_url: null,
      my_rsvp_status: null,
    };
    setMocks({ groups: [mockGroup], meetings: [meeting] });
    render(<HomeClient />);
    expect(screen.getByTestId("meeting-pill")).toBeInTheDocument();
  });

  it("hides badges section when empty", () => {
    setMocks({ groups: [mockGroup], badges: [] });
    render(<HomeClient />);
    expect(screen.queryByText("Conquistas recentes")).not.toBeInTheDocument();
  });

  it("shows greeting with first name", () => {
    setMocks({ groups: [mockGroup] });
    render(<HomeClient />);
    expect(screen.getByText("Maria")).toBeInTheDocument();
  });
});
