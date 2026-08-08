import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UpcomingMeetingPill } from "../upcoming-meeting-pill";
import type { UpcomingMeetingItem } from "@/lib/types/meeting";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

/** 13/08/2026, meio-dia — as datas dos testes são relativas a este instante. */
const HOJE = new Date(2026, 7, 13, 12, 0, 0);

function makeMeeting(
  overrides: Partial<UpcomingMeetingItem> = {},
): UpcomingMeetingItem {
  return {
    id: "e1",
    title: "Discussão final de Duna",
    scheduled_at: new Date(2026, 7, 20, 19, 30).toISOString(),
    duration_minutes: 90,
    meeting_type: "virtual",
    group_id: "g1",
    group_name: "Leitores de Domingo",
    group_photo_url: null,
    my_rsvp_status: "going",
    ...overrides,
  };
}

describe("UpcomingMeetingPill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(HOJE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra o título do encontro", () => {
    render(<UpcomingMeetingPill meeting={makeMeeting()} />);
    expect(screen.getByText("Discussão final de Duna")).toBeInTheDocument();
  });

  /**
   * A data estava espremida numa segunda coluna, ao lado de uma pílula com o
   * nome do clube, e quebrava em duas linhas: "11 de ago às" / "11:45". Num
   * encontro futuro o que mais importa é *quando*.
   */
  it("dá à data uma linha própria, inteira", () => {
    render(<UpcomingMeetingPill meeting={makeMeeting()} />);

    const quando = screen.getByText(/qui, 20 de ago às 19:30/i);
    expect(quando).toBeInTheDocument();
    // Linha própria, e não um pedaço de outra: o texto é o conteúdo do
    // elemento, não um fragmento dele.
    expect(quando.textContent?.trim()).toMatch(/^qui, 20 de ago às 19:30$/i);
  });

  it("chama hoje e amanhã pelo nome", () => {
    const { rerender } = render(
      <UpcomingMeetingPill
        meeting={makeMeeting({
          scheduled_at: new Date(2026, 7, 13, 20, 0).toISOString(),
        })}
      />,
    );
    expect(screen.getByText("Hoje às 20:00")).toBeInTheDocument();

    rerender(
      <UpcomingMeetingPill
        meeting={makeMeeting({
          scheduled_at: new Date(2026, 7, 14, 9, 15).toISOString(),
        })}
      />,
    );
    expect(screen.getByText("Amanhã às 09:15")).toBeInTheDocument();
  });

  it("a data vem antes do clube na ordem de leitura", () => {
    render(<UpcomingMeetingPill meeting={makeMeeting()} />);

    const posicao = screen
      .getByText(/20 de ago/i)
      .compareDocumentPosition(screen.getByText("Leitores de Domingo"));
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /**
   * O clube era uma pílula com borda, competindo com o título do encontro; o
   * RSVP era um círculo verde sem legenda, num lugar onde ninguém confere
   * presença.
   */
  it("o clube é texto, não etiqueta", () => {
    const { container } = render(<UpcomingMeetingPill meeting={makeMeeting()} />);

    const clube = screen.getByText("Leitores de Domingo");
    expect(clube.className).not.toContain("border");
    expect(clube.className).not.toContain("rounded");

    expect(container.querySelector('[aria-label^="RSVP"]')).toBeNull();
  });

  it("leva ao encontro", () => {
    render(<UpcomingMeetingPill meeting={makeMeeting()} />);

    fireEvent.click(screen.getByRole("button"));
    expect(mockPush).toHaveBeenCalledWith("/meetings/e1");
  });
});
