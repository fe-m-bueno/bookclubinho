import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    motion: {
      div: ({
        children,
        ...props
      }: React.PropsWithChildren<Record<string, unknown>>) => {
        const htmlProps = Object.fromEntries(
          Object.entries(props).filter(
            ([key]) =>
              ![
                "variants",
                "initial",
                "animate",
                "whileInView",
                "viewport",
                "transition",
              ].includes(key),
          ),
        );
        return <div {...htmlProps}>{children}</div>;
      },
    },
    useReducedMotion: () => false,
  };
});

import { EmotionalStatsSection } from "@/components/stats/emotional-stats-section";
import type { EmotionalStats } from "@/lib/types/stats";

const mockStats: EmotionalStats = {
  total_reviews: 10,
  cried_count: 4,
  loved_it_count: 8,
  felt_aroused_count: 2,
  found_heavy_count: 5,
  wants_more_count: 7,
};

describe("EmotionalStatsSection", () => {
  it("shows empty state when total_reviews is 0", () => {
    render(
      <EmotionalStatsSection stats={{ ...mockStats, total_reviews: 0 }} />,
    );
    expect(screen.getByText("Nenhuma review ainda.")).toBeInTheDocument();
  });

  it("renders the card title", () => {
    render(<EmotionalStatsSection stats={mockStats} />);
    expect(screen.getByText("Como o grupo sentiu")).toBeInTheDocument();
  });

  it("renders all 5 emotional bars", () => {
    render(<EmotionalStatsSection stats={mockStats} />);
    expect(screen.getByText(/do grupo já chorou/i)).toBeInTheDocument();
    expect(screen.getByText(/amou o livro/i)).toBeInTheDocument();
    expect(screen.getByText(/sentiu tesão/i)).toBeInTheDocument();
    expect(screen.getByText(/achou pesado/i)).toBeInTheDocument();
    expect(screen.getByText(/quer mais do autor/i)).toBeInTheDocument();
  });

  it("shows correct percentage for cried_count", () => {
    render(<EmotionalStatsSection stats={mockStats} />);
    // 4/10 = 40%
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("shows correct percentage for loved_it_count", () => {
    render(<EmotionalStatsSection stats={mockStats} />);
    // 8/10 = 80%
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("shows 0% for zero counts", () => {
    render(
      <EmotionalStatsSection
        stats={{ ...mockStats, felt_aroused_count: 0 }}
      />,
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("shows count/total ratios", () => {
    render(<EmotionalStatsSection stats={mockStats} />);
    // cried: 4/10
    expect(screen.getByText("4/10")).toBeInTheDocument();
    // loved_it: 8/10
    expect(screen.getByText("8/10")).toBeInTheDocument();
  });

  it("rounds percentages to nearest integer", () => {
    render(
      <EmotionalStatsSection
        stats={{ ...mockStats, total_reviews: 3, cried_count: 1 }}
      />,
    );
    // 1/3 = 33%
    expect(screen.getByText("33%")).toBeInTheDocument();
  });
});
