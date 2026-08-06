/**
 * jsdom não faz layout, e o virtualizador só existe em função de layout: ele
 * lê a altura do container de scroll, mede cada linha e escreve `scrollTop`.
 * Este harness dá a esses três pontos um comportamento determinístico, e ainda
 * expõe um contador de leituras de layout — é assim que o teste de throttle do
 * `handleScroll` prova que a medição não acontece a cada evento de scroll.
 */

export const VIEWPORT_HEIGHT = 400;
export const VIEWPORT_WIDTH = 600;

/**
 * Alturas variáveis de propósito: 60/100/140 px, todas diferentes do
 * `estimateSize` do componente, para que o teste só passe com medição dinâmica.
 */
export function heightForMessageId(id: string): number {
  const n = Number(id.replace(/\D/g, "")) || 0;
  return 60 + (n % 3) * 40;
}

type RafCallback = (time: number) => void;

export interface VirtualLayoutHarness {
  /** Executa os callbacks de rAF pendentes, em rodadas, até esvaziar. */
  flushRaf: (rounds?: number) => void;
  /**
   * Leituras de `scrollHeight`/`clientHeight` no container de scroll — as que
   * forçam reflow depois de o browser ter escrito `scrollTop`. `scrollTop` em
   * si não conta: o próprio virtualizador o lê em todo evento de scroll.
   */
  layoutReads: () => number;
  resetLayoutReads: () => void;
  /** Escreve `scrollTop` e dispara o evento de scroll, como o browser faria. */
  scrollTo: (top: number) => void;
  /** Dispara o IntersectionObserver do scroll infinito. */
  triggerIntersection: (isIntersecting?: boolean) => void;
  restore: () => void;
}

function isScrollContainer(el: Element): boolean {
  return (el as HTMLElement).dataset?.testid === "chat-scroll";
}

export function installVirtualLayout(): VirtualLayoutHarness {
  const originals = {
    ResizeObserver: (globalThis as Record<string, unknown>).ResizeObserver,
    IntersectionObserver: (globalThis as Record<string, unknown>)
      .IntersectionObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    scrollTo: Element.prototype.scrollTo,
    offsetHeight: Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight",
    ),
    offsetWidth: Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth",
    ),
    clientHeight: Object.getOwnPropertyDescriptor(
      Element.prototype,
      "clientHeight",
    ),
    scrollHeight: Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollHeight",
    ),
    scrollTop: Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop"),
  };

  let reads = 0;
  const scrollTops = new WeakMap<Element, number>();
  const rafQueue = new Map<number, RafCallback>();
  let rafId = 0;
  const intersectionCallbacks = new Set<IntersectionObserverCallback>();

  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class FakeIntersectionObserver {
    constructor(private cb: IntersectionObserverCallback) {
      intersectionCallbacks.add(cb);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      intersectionCallbacks.delete(this.cb);
    }
  }

  (globalThis as Record<string, unknown>).ResizeObserver = NoopResizeObserver;
  (globalThis as Record<string, unknown>).IntersectionObserver =
    FakeIntersectionObserver;

  globalThis.requestAnimationFrame = ((cb: RafCallback) => {
    const id = ++rafId;
    rafQueue.set(id, cb);
    return id;
  }) as typeof globalThis.requestAnimationFrame;

  globalThis.cancelAnimationFrame = ((id: number) => {
    rafQueue.delete(id);
  }) as typeof globalThis.cancelAnimationFrame;

  /** Soma de tudo que o container de scroll contém, incluindo a lista virtual. */
  function contentHeight(el: Element): number {
    let total = 0;
    for (const child of Array.from(el.children)) {
      const styleHeight = (child as HTMLElement).style.height;
      if (styleHeight.endsWith("px")) {
        total += Number.parseFloat(styleHeight);
      }
    }
    return total;
  }

  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (isScrollContainer(this)) return VIEWPORT_HEIGHT;
      const messageId = this.dataset?.messageId;
      if (this.hasAttribute("data-index") && messageId) {
        return heightForMessageId(messageId);
      }
      return 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return isScrollContainer(this) ? VIEWPORT_WIDTH : 0;
    },
  });

  Object.defineProperty(Element.prototype, "clientHeight", {
    configurable: true,
    get(this: Element) {
      if (!isScrollContainer(this)) return 0;
      reads++;
      return VIEWPORT_HEIGHT;
    },
  });

  Object.defineProperty(Element.prototype, "scrollHeight", {
    configurable: true,
    get(this: Element) {
      if (!isScrollContainer(this)) return 0;
      reads++;
      return Math.max(contentHeight(this), VIEWPORT_HEIGHT);
    },
  });

  Object.defineProperty(Element.prototype, "scrollTop", {
    configurable: true,
    get(this: Element) {
      if (isScrollContainer(this)) reads++;
      return scrollTops.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      scrollTops.set(this, Math.max(0, value));
    },
  });

  Element.prototype.scrollTo = function scrollToStub(
    this: Element,
    ...args: unknown[]
  ) {
    const opts = args[0];
    const top =
      typeof opts === "number" ? (args[1] as number) : (opts as ScrollToOptions)?.top;
    if (typeof top === "number") {
      this.scrollTop = top;
      this.dispatchEvent(new Event("scroll"));
    }
  } as typeof Element.prototype.scrollTo;

  function findScrollContainer(): Element | null {
    return document.querySelector('[data-testid="chat-scroll"]');
  }

  return {
    flushRaf(rounds = 6) {
      for (let i = 0; i < rounds; i++) {
        if (rafQueue.size === 0) return;
        const pending = Array.from(rafQueue.entries());
        rafQueue.clear();
        for (const [, cb] of pending) cb(i);
      }
    },
    layoutReads: () => reads,
    resetLayoutReads: () => {
      reads = 0;
    },
    scrollTo(top: number) {
      const el = findScrollContainer();
      if (!el) throw new Error("container de scroll do chat não encontrado");
      el.scrollTop = top;
      el.dispatchEvent(new Event("scroll"));
    },
    triggerIntersection(isIntersecting = true) {
      for (const cb of Array.from(intersectionCallbacks)) {
        cb(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      }
    },
    restore() {
      (globalThis as Record<string, unknown>).ResizeObserver =
        originals.ResizeObserver;
      (globalThis as Record<string, unknown>).IntersectionObserver =
        originals.IntersectionObserver;
      globalThis.requestAnimationFrame = originals.requestAnimationFrame;
      globalThis.cancelAnimationFrame = originals.cancelAnimationFrame;
      Element.prototype.scrollTo = originals.scrollTo;
      for (const [proto, prop, descriptor] of [
        [HTMLElement.prototype, "offsetHeight", originals.offsetHeight],
        [HTMLElement.prototype, "offsetWidth", originals.offsetWidth],
        [Element.prototype, "clientHeight", originals.clientHeight],
        [Element.prototype, "scrollHeight", originals.scrollHeight],
        [Element.prototype, "scrollTop", originals.scrollTop],
      ] as const) {
        if (descriptor) {
          Object.defineProperty(proto, prop, descriptor);
        } else {
          delete (proto as unknown as Record<string, unknown>)[prop];
        }
      }
    },
  };
}

/** Posição na tela de uma mensagem: onde ela está desenhada menos o scroll. */
export function screenTopOf(messageId: string): number {
  const row = document.querySelector<HTMLElement>(
    `[data-message-id="${messageId}"]`,
  );
  if (!row) throw new Error(`mensagem ${messageId} não está montada`);
  const match = /translateY\((-?[\d.]+)px\)/.exec(row.style.transform);
  if (!match) throw new Error(`mensagem ${messageId} sem translateY`);
  const container = document.querySelector('[data-testid="chat-scroll"]')!;
  return Number.parseFloat(match[1]) - container.scrollTop;
}
