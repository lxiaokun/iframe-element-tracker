import { vi } from 'vitest';

/**
 * Stub ResizeObserver for jsdom (which doesn't support it).
 */
export class MockResizeObserver {
  callback: ResizeObserverCallback;
  observedElements: Set<Element> = new Set();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.observedElements.add(target);
  }

  unobserve(target: Element): void {
    this.observedElements.delete(target);
  }

  disconnect(): void {
    this.observedElements.clear();
  }

  /** Simulate a resize event for testing */
  triggerResize(entries: Partial<ResizeObserverEntry>[] = []): void {
    this.callback(entries as ResizeObserverEntry[], this);
  }
}

/**
 * Stub IntersectionObserver for jsdom.
 */
export class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  observedElements: Set<Element> = new Set();
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.observedElements.add(target);
  }

  unobserve(target: Element): void {
    this.observedElements.delete(target);
  }

  disconnect(): void {
    this.observedElements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Simulate an intersection event for testing */
  triggerIntersection(entries: Partial<IntersectionObserverEntry>[] = []): void {
    this.callback(entries as IntersectionObserverEntry[], this);
  }
}

/**
 * Install global mocks for ResizeObserver and IntersectionObserver.
 * Call this in beforeEach/beforeAll.
 */
export function installObserverMocks(): void {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
}

/**
 * Create a mock iframe element with a mock contentWindow.
 */
export function createMockIframe(
  computedStyle: Partial<CSSStyleDeclaration> = {},
): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);

  // Mock contentWindow
  const mockContentWindow = {} as Window;
  Object.defineProperty(iframe, 'contentWindow', {
    get: () => mockContentWindow,
    configurable: true,
  });

  // Mock getComputedStyle for the iframe
  const originalGetComputedStyle = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
    if (el === iframe) {
      return createMockComputedStyle(computedStyle);
    }
    return originalGetComputedStyle(el);
  });

  return iframe;
}

/**
 * Create a mock CSSStyleDeclaration with defaults.
 */
export function createMockComputedStyle(
  overrides: Partial<CSSStyleDeclaration> = {},
): CSSStyleDeclaration {
  const defaults: Record<string, string> = {
    transform: 'none',
    zoom: '1',
    marginLeft: '0px',
    marginTop: '0px',
    borderLeftWidth: '0px',
    borderTopWidth: '0px',
    paddingLeft: '0px',
    paddingTop: '0px',
    left: '0px',
    top: '0px',
  };

  const merged = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null) {
      merged[key] = String(value);
    }
  }

  return new Proxy(merged as unknown as CSSStyleDeclaration, {
    get(target, prop) {
      const t = target as unknown as Record<string, unknown>;
      if (typeof prop === 'string' && prop in t) {
        return t[prop];
      }
      if (prop === 'getPropertyValue') {
        return (name: string) => (t as Record<string, string>)[name] ?? '';
      }
      return '';
    },
  });
}
