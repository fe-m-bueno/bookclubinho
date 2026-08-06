import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useCreateMeeting,
  useDeleteMeeting,
  useDeleteMeetingStandalone,
  useUpdateMeeting,
  useUpdateRsvp,
  useUpdateRsvpStandalone,
} from "../use-meeting-mutations";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    del: vi.fn(async () => undefined),
  },
}));

const GROUP = "g-1";
const MEETING = "m-1";

/**
 * O que interessa aqui não é o request — é quais caches ficam stale depois.
 *
 * Os dois caminhos de RSVP discordavam: pela página do clube invalidava a
 * lista e o badge do nav; pela página do encontro, só o detalhe. Cada um
 * esquecia exatamente o que o outro lembrava, e o `Standalone` sequer tinha o
 * `groupId` no escopo para fazer melhor. O efeito era um RSVP na página do
 * encontro deixando a lista do clube desatualizada.
 */
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidated: unknown[][] = [];
  const original = client.invalidateQueries.bind(client);
  vi.spyOn(client, "invalidateQueries").mockImplementation((filters) => {
    invalidated.push((filters?.queryKey ?? []) as unknown[]);
    return original(filters);
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  /** Uma key foi atingida se alguma invalidação é ela ou um prefixo dela. */
  const atingiu = (alvo: unknown[]) =>
    invalidated.some((k) => k.every((parte, i) => parte === alvo[i]));

  return { wrapper, atingiu };
}

const LISTA_DO_CLUBE = ["meetings", GROUP];
const BADGE_DO_NAV = ["meetings-badge", GROUP];
const DETALHE = ["meeting", MEETING];
const PROXIMOS = ["upcomingMeetings"];

beforeEach(() => vi.clearAllMocks());

describe("mutações de encontro", () => {
  it("RSVP pela página do clube atinge lista, badge e detalhe", async () => {
    const { wrapper, atingiu } = setup();
    const { result } = renderHook(() => useUpdateRsvp(GROUP), { wrapper });

    await act(async () => {
      result.current.mutate({ meetingId: MEETING, status: "going" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(atingiu(LISTA_DO_CLUBE)).toBe(true);
    expect(atingiu(BADGE_DO_NAV)).toBe(true);
    expect(atingiu(DETALHE)).toBe(true);
  });

  it("RSVP pela página do encontro atinge o mesmo conjunto", async () => {
    // Era o buraco: só o detalhe era invalidado.
    const { wrapper, atingiu } = setup();
    const { result } = renderHook(() => useUpdateRsvpStandalone(MEETING), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ status: "going" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(atingiu(DETALHE)).toBe(true);
    expect(atingiu(LISTA_DO_CLUBE)).toBe(true);
    expect(atingiu(BADGE_DO_NAV)).toBe(true);
  });

  it("apagar pela página do clube também atinge próximos encontros", async () => {
    // Era o buraco inverso: o caminho do clube esquecia `upcomingMeetings`,
    // que alimenta a home.
    const { wrapper, atingiu } = setup();
    const { result } = renderHook(() => useDeleteMeeting(GROUP), { wrapper });

    await act(async () => {
      result.current.mutate(MEETING);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(atingiu(LISTA_DO_CLUBE)).toBe(true);
    expect(atingiu(BADGE_DO_NAV)).toBe(true);
    expect(atingiu(PROXIMOS)).toBe(true);
  });

  it("apagar pela página do encontro atinge lista e badge", async () => {
    const { wrapper, atingiu } = setup();
    const { result } = renderHook(() => useDeleteMeetingStandalone(), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate(MEETING);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(atingiu(LISTA_DO_CLUBE)).toBe(true);
    expect(atingiu(BADGE_DO_NAV)).toBe(true);
    expect(atingiu(PROXIMOS)).toBe(true);
  });

  it("criar e editar atingem o mesmo conjunto que apagar", async () => {
    // `criar` e `editar` recebem payloads diferentes; aqui só interessa disparar
    // e olhar o cache, então a variável da mutação é apagada do tipo.
    const casos: ReadonlyArray<
      readonly [string, () => { mutate: (v: never) => void; isSuccess: boolean }]
    > = [
      ["criar", () => useCreateMeeting(GROUP)],
      ["editar", () => useUpdateMeeting(GROUP)],
    ];

    for (const [nome, hook] of casos) {
      const { wrapper, atingiu } = setup();
      const { result } = renderHook(hook, { wrapper });

      await act(async () => {
        (result.current.mutate as (v: unknown) => void)(
          nome === "criar"
            ? { title: "x", scheduled_at: "2026-01-01T00:00:00Z" }
            : { meetingId: MEETING, payload: { title: "y" } },
        );
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(atingiu(LISTA_DO_CLUBE), nome).toBe(true);
      expect(atingiu(BADGE_DO_NAV), nome).toBe(true);
      expect(atingiu(PROXIMOS), nome).toBe(true);
    }
  });
});
