import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemberAvatarStack } from "../member-avatar-stack";
import type { MemberSummary } from "@/lib/types/group";

function makeMember(overrides: Partial<MemberSummary> = {}): MemberSummary {
  return {
    user_id: `u${Math.random()}`,
    username: "user",
    display_name: "User",
    avatar_url: null,
    role: "member",
    joined_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("MemberAvatarStack", () => {
  it("renders avatars for each member up to max", () => {
    const members = [
      makeMember({ user_id: "u1", display_name: "Alice" }),
      makeMember({ user_id: "u2", display_name: "Bob" }),
      makeMember({ user_id: "u3", display_name: "Carol" }),
    ];

    render(<MemberAvatarStack members={members} />);

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("shows overflow count when members exceed max", () => {
    const members = Array.from({ length: 6 }, (_, i) =>
      makeMember({ user_id: `u${i}`, display_name: `User ${i}` }),
    );

    render(<MemberAvatarStack members={members} max={4} />);

    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("does not show overflow when members equal max", () => {
    const members = Array.from({ length: 4 }, (_, i) =>
      makeMember({ user_id: `u${i}`, display_name: `User ${i}` }),
    );

    render(<MemberAvatarStack members={members} max={4} />);

    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });

  it("uses username fallback when display_name is null", () => {
    const members = [
      makeMember({
        user_id: "u1",
        display_name: null,
        username: "zara",
      }),
    ];

    render(<MemberAvatarStack members={members} />);

    expect(screen.getByText("Z")).toBeInTheDocument();
  });

  it("uses ? fallback when both display_name and username are null", () => {
    const members = [
      makeMember({
        user_id: "u1",
        display_name: null,
        username: null,
      }),
    ];

    render(<MemberAvatarStack members={members} />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
