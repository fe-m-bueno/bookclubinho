import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GroupDetailResponse } from "@/lib/types/group";
import { ChatHeader } from "../chat-header";

const group: GroupDetailResponse = {
  id: "g1",
  name: "Clubinho",
  description: null,
  photo_url: null,
  invite_code: null,
  max_members: 8,
  member_count: 2,
  members: [],
  current_user_id: "u1",
  current_round: null,
  created_at: "2026-01-01T00:00:00Z",
};

/**
 * #273: o header mentia "Reconectando..." em vermelho desde o primeiro
 * render, antes de qualquer tentativa de conexão terminar. `connecting` (chat
 * acabou de abrir) e `disconnected` (já esteve de pé e caiu) são estados
 * diferentes — só o segundo é erro de verdade.
 */
describe("ChatHeader — indicador de conexão SSE", () => {
  it("não mostra aviso enquanto ainda está conectando", () => {
    render(
      <ChatHeader
        group={group}
        chapterFilter={null}
        onClearFilter={vi.fn()}
        sseStatus="connecting"
      />,
    );

    expect(screen.queryByText(/reconectando/i)).not.toBeInTheDocument();
  });

  it("não mostra aviso enquanto conectado", () => {
    render(
      <ChatHeader
        group={group}
        chapterFilter={null}
        onClearFilter={vi.fn()}
        sseStatus="connected"
      />,
    );

    expect(screen.queryByText(/reconectando/i)).not.toBeInTheDocument();
  });

  it("mostra aviso só quando a conexão caiu de verdade", () => {
    render(
      <ChatHeader
        group={group}
        chapterFilter={null}
        onClearFilter={vi.fn()}
        sseStatus="disconnected"
      />,
    );

    expect(screen.getByText(/reconectando/i)).toBeInTheDocument();
  });
});
