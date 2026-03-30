import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useChatSSE } from "../use-chat-sse";

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  withCredentials: boolean;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = Boolean(init?.withCredentials);
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  emit(type: string, data = "{}") {
    const event = new MessageEvent(type, { data });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  close() {}
}

function TestComponent() {
  const { connected } = useChatSSE({
    groupId: "group-123",
    currentUserId: "user-1",
  });

  return <span>{connected ? "online" : "offline"}</span>;
}

describe("useChatSSE", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    // @ts-expect-error test shim
    globalThis.EventSource = MockEventSource;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
  });

  it("connects through the same-origin API path", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    );

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe(
      "/api/v1/groups/group-123/chat/stream"
    );
    expect(MockEventSource.instances[0]?.withCredentials).toBe(true);
  });

  it("marks the connection as online after the connected event", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    );

    expect(screen.getByText("offline")).toBeInTheDocument();

    act(() => {
      MockEventSource.instances[0]?.emit("connected");
    });

    expect(screen.getByText("online")).toBeInTheDocument();
  });
});
