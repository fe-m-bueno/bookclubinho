import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GroupHomeCard } from "../group-home-card";
import type { GroupListItem } from "@/lib/types/group";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const baseGroup: GroupListItem = {
  id: "g1",
  name: "Clube Literário",
  photo_url: null,
  member_count: 4,
  members_preview: [
    { user_id: "u1", display_name: "Alice", avatar_url: null },
    { user_id: "u2", display_name: "Bob", avatar_url: null },
  ],
  current_round: null,
  my_reading_progress: null,
  last_message_preview: null,
  last_activity_at: null,
};

describe("GroupHomeCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders group name", () => {
    render(<GroupHomeCard group={baseGroup} />);
    expect(screen.getByText("Clube Literário")).toBeInTheDocument();
  });

  it("shows member count", () => {
    render(<GroupHomeCard group={baseGroup} />);
    expect(screen.getByText("4 membros")).toBeInTheDocument();
  });

  it("navigates to group on click", () => {
    render(<GroupHomeCard group={baseGroup} />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockPush).toHaveBeenCalledWith("/groups/g1");
  });

  it("shows round status badge when round present", () => {
    const group: GroupListItem = {
      ...baseGroup,
      current_round: {
        id: "r1",
        round_number: 1,
        status: "reading",
        book_title: "O Senhor dos Anéis",
        book_author: "Tolkien",
        book_cover_url: null,
        book_page_count: 500,
      },
    };
    render(<GroupHomeCard group={group} />);
    expect(screen.getByText("Lendo")).toBeInTheDocument();
  });

  it("shows book title when round has book", () => {
    const group: GroupListItem = {
      ...baseGroup,
      current_round: {
        id: "r1",
        round_number: 1,
        status: "reading",
        book_title: "O Senhor dos Anéis",
        book_author: "Tolkien",
        book_cover_url: null,
        book_page_count: 500,
      },
    };
    render(<GroupHomeCard group={group} />);
    expect(screen.getByText("O Senhor dos Anéis")).toBeInTheDocument();
  });

  it("shows reading progress bar when reading", () => {
    const group: GroupListItem = {
      ...baseGroup,
      current_round: {
        id: "r1",
        round_number: 1,
        status: "reading",
        book_title: "Livro",
        book_author: null,
        book_cover_url: null,
        book_page_count: null,
      },
      my_reading_progress: { current_page: 100, total_pages: 200, percentage: 50 },
    };
    render(<GroupHomeCard group={group} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows last message preview", () => {
    const group: GroupListItem = {
      ...baseGroup,
      last_message_preview: {
        sender_display_name: "Alice",
        sender_avatar_url: null,
        content_text: "Olá pessoal!",
        content_type: "text",
        created_at: new Date().toISOString(),
      },
    };
    render(<GroupHomeCard group={group} />);
    expect(screen.getByText(/Olá pessoal!/)).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });
});
