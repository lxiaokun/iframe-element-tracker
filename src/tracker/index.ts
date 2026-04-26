import {
  ElementRect,
  ElementStyles,
  ElementVisibility,
  ElementAttributes,
  Bounds,
  Spacing,
  TrackerMessage,
  OcclusionInfo,
  OccluderRect,
  MESSAGE_TYPE,
} from '../shared';

/**
 * Compute the intersection of two Bounds rectangles.
 * Returns a Bounds whose width/height may be 0 if they don't overlap.
 */
function intersectBounds(a: Bounds, b: Bounds): Bounds {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

/**
 * Callback type for additional message listeners
 */
export type TrackerMessageListener = (message: TrackerMessage) => void;

/**
 * Options for registering an element
 */
export interface RegisterOptions {
  /** User-defined custom data */
  metadata?: Record<string, unknown>;
  /** Enable occlusion detection for this element (overrides global setting) */
  detectOcclusion?: boolean;
}

/**
 * ElementTracker configuration options
 */
export interface TrackerOptions {
  /** Target window, defaults to window.parent */
  targetWindow?: Window;
  /** Target origin, defaults to '*' */
  targetOrigin?: string;
  /** Direct message callback, bypasses postMessage when provided */
  onMessage?: (message: TrackerMessage) => void;
  /**
   * Scroll container element. Defaults to window (document scrolling).
   * When set, tracker reports this element's scroll state in containerScroll
   * instead of window's, and binds scroll events to this element.
   */
  scrollContainer?: HTMLElement;
  /** Enable z-index occlusion detection (uses elementFromPoint). Default false */
  detectOcclusion?: boolean;
}

/**
 * Internal record for a tracked element
 */
interface TrackedElement {
  element: Element;
  id: string;
  metadata?: Record<string, unknown>;
  detectOcclusion: boolean;
  lastRect: ElementRect | null;
}

/**
 * ElementTracker - Used inside iframe pages
 * Registers and tracks DOM element position, size, and style changes
 */
export class ElementTracker {
  private trackedElements: Map<string, TrackedElement> = new Map();
  private targetWindow: Window;
  private targetOrigin: string;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private scrollHandler: () => void;
  private resizeHandler: () => void;
  private onMessage: ((message: TrackerMessage) => void) | null;
  private messageListeners: Set<TrackerMessageListener> = new Set();
  private pendingUpdate: number | null = null;
  private isDestroyed = false;
  private scrollContainer: HTMLElement | null;
  private detectOcclusion: boolean;
  private lastUpdateDuration: number = 0;

  constructor(options: TrackerOptions = {}) {
    this.targetWindow = options.targetWindow ?? window.parent;
    this.targetOrigin = options.targetOrigin ?? '*';
    this.onMessage = options.onMessage ?? null;
    this.scrollContainer = options.scrollContainer ?? null;
    this.detectOcclusion = options.detectOcclusion ?? false;

    // Create ResizeObserver to monitor element size changes
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleUpdate();
    });

    // Create IntersectionObserver to monitor element visibility changes
    this.intersectionObserver = new IntersectionObserver(
      () => {
        this.scheduleUpdate();
      },
      {
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
      },
    );

    // Scroll event handler - sync update for best responsiveness
    this.scrollHandler = () => {
      this.performUpdate();
    };

    // Window resize event handler
    this.resizeHandler = () => {
      this.performUpdate();
    };

    // Bind events
    const scrollTarget: EventTarget = this.scrollContainer ?? window;
    scrollTarget.addEventListener('scroll', this.scrollHandler, { passive: true, capture: true });
    window.addEventListener('resize', this.resizeHandler, { passive: true });
  }

  /**
   * Register an element for tracking
   */
  register(element: Element, id: string, options: RegisterOptions = {}): void {
    if (this.isDestroyed) {
      console.warn('ElementTracker has been destroyed');
      return;
    }

    if (this.trackedElements.has(id)) {
      console.warn(`Element with id "${id}" is already registered`);
      return;
    }

    const tracked: TrackedElement = {
      element,
      id,
      metadata: options.metadata,
      detectOcclusion: options.detectOcclusion ?? this.detectOcclusion,
      lastRect: null,
    };

    this.trackedElements.set(id, tracked);
    this.resizeObserver.observe(element);
    this.intersectionObserver.observe(element);

    // Send initial state immediately
    this.sendUpdate('init', [this.getElementRect(tracked)]);
  }

  /**
   * Unregister an element
   */
  unregister(id: string): void {
    const tracked = this.trackedElements.get(id);
    if (!tracked) {
      return;
    }

    this.resizeObserver.unobserve(tracked.element);
    this.intersectionObserver.unobserve(tracked.element);
    this.trackedElements.delete(id);

    // Send remove notification
    this.sendUpdate('remove', [{ id } as ElementRect]);
  }

  /**
   * Update element's metadata
   */
  updateMetadata(id: string, metadata: Record<string, unknown>): void {
    const tracked = this.trackedElements.get(id);
    if (!tracked) {
      return;
    }

    tracked.metadata = { ...tracked.metadata, ...metadata };
    this.scheduleUpdate();
  }

  /**
   * Manually trigger an update
   */
  forceUpdate(): void {
    this.performUpdate();
  }

  /**
   * Get the duration of the last performUpdate() call in milliseconds.
   */
  getLastUpdateDuration(): number {
    return this.lastUpdateDuration;
  }

  /**
   * Add an additional message listener called alongside the primary dispatch.
   * If elements are already registered, the listener is immediately called
   * with an 'init' message containing the current state.
   * Returns an unsubscribe function.
   */
  addMessageListener(listener: TrackerMessageListener): () => void {
    this.messageListeners.add(listener);

    // Auto-replay current state to the new listener
    if (this.trackedElements.size > 0) {
      const elements: ElementRect[] = [];
      for (const tracked of this.trackedElements.values()) {
        elements.push(this.getElementRect(tracked));
      }
      const message: TrackerMessage = {
        type: MESSAGE_TYPE,
        action: 'init',
        elements,
      };
      try {
        listener(message);
      } catch (error) {
        console.error('Error in message listener:', error);
      }
    }

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /**
   * Remove a previously added message listener
   */
  removeMessageListener(listener: TrackerMessageListener): void {
    this.messageListeners.delete(listener);
  }

  /**
   * Destroy SDK and clean up all resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    if (this.pendingUpdate !== null) {
      cancelAnimationFrame(this.pendingUpdate);
    }

    const scrollTarget: EventTarget = this.scrollContainer ?? window;
    scrollTarget.removeEventListener('scroll', this.scrollHandler, { capture: true });
    window.removeEventListener('resize', this.resizeHandler);

    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.trackedElements.clear();
    this.messageListeners.clear();
  }

  /**
   * Schedule an update (throttled)
   */
  private scheduleUpdate(): void {
    if (this.pendingUpdate !== null || this.isDestroyed) {
      return;
    }

    this.pendingUpdate = requestAnimationFrame(() => {
      this.pendingUpdate = null;
      this.performUpdate();
    });
  }

  /**
   * Perform update - calculate latest state for all elements and send
   */
  private performUpdate(): void {
    if (this.isDestroyed || this.trackedElements.size === 0) {
      return;
    }

    const t0 = performance.now();

    const elements: ElementRect[] = [];

    for (const tracked of this.trackedElements.values()) {
      const rect = this.getElementRect(tracked);
      tracked.lastRect = rect;
      elements.push(rect);
    }

    const updateDuration = performance.now() - t0;
    this.lastUpdateDuration = updateDuration;

    this.sendUpdate('update', elements, updateDuration);
  }

  /**
   * Get complete element information
   */
  private getElementRect(tracked: TrackedElement): ElementRect {
    const { element, id, metadata } = tracked;
    const domRect = element.getBoundingClientRect();
    const computedStyle = getComputedStyle(element);
    const htmlElement = element as HTMLElement;

    // Check if element has transform
    const hasTransform = computedStyle.transform && computedStyle.transform !== 'none';

    let bounds: Bounds;

    if (hasTransform) {
      // When transformed, use offsetWidth/offsetHeight for original size
      const originalWidth = htmlElement.offsetWidth;
      const originalHeight = htmlElement.offsetHeight;

      // Parse the CSS transform matrix: matrix(a, b, c, d, e, f)
      const matrixMatch = computedStyle.transform.match(/^matrix\((.+)\)$/);
      if (matrixMatch) {
        const [a, b, c, d, e, f] = matrixMatch[1].split(',').map((v) => parseFloat(v.trim()));

        // Parse transform-origin (always computed as "Xpx Ypx")
        const originParts = computedStyle.transformOrigin.split(' ');
        const ox = parseFloat(originParts[0]) || 0;
        const oy = parseFloat(originParts[1]) || 0;

        // CSS transform applies as: translate(origin) * matrix * translate(-origin)
        // A point (px, py) in local coordinates transforms to:
        //   tx = ox + a*(px-ox) + c*(py-oy) + e
        //   ty = oy + b*(px-ox) + d*(py-oy) + f
        // Compute the four transformed corners (in element-local space)
        const corners = [
          [0, 0],
          [originalWidth, 0],
          [0, originalHeight],
          [originalWidth, originalHeight],
        ];
        let minTX = Infinity;
        let minTY = Infinity;
        for (const [px, py] of corners) {
          const tx = ox + a * (px - ox) + c * (py - oy) + e;
          const ty = oy + b * (px - ox) + d * (py - oy) + f;
          if (tx < minTX) minTX = tx;
          if (ty < minTY) minTY = ty;
        }

        // domRect is the AABB of the transformed element in viewport.
        // domRect.x = untransformedX + minTX, so:
        bounds = {
          x: domRect.x - minTX,
          y: domRect.y - minTY,
          width: originalWidth,
          height: originalHeight,
        };
      } else {
        // Fallback for non-matrix transforms (e.g. matrix3d): use center-based approximation
        const centerX = domRect.x + domRect.width / 2;
        const centerY = domRect.y + domRect.height / 2;
        bounds = {
          x: centerX - originalWidth / 2,
          y: centerY - originalHeight / 2,
          width: originalWidth,
          height: originalHeight,
        };
      }
    } else {
      bounds = {
        x: domRect.x,
        y: domRect.y,
        width: domRect.width,
        height: domRect.height,
      };
    }

    const visibility = this.getVisibility(element, domRect);
    const occlusion = this.getOcclusion(element, visibility, tracked.detectOcclusion);
    const styles = this.getStyles(computedStyle);
    const scroll = this.getScroll(element);
    const attributes = this.getAttributes(htmlElement);

    return {
      id,
      timestamp: Date.now(),
      attributes,
      bounds,
      visibility,
      styles,
      scroll,
      metadata,
      occlusion,
    };
  }

  /**
   * Get DOM element attributes (id, class, dataset)
   */
  private getAttributes(element: HTMLElement): ElementAttributes {
    // Convert DOMStringMap to plain object
    const dataset: Record<string, string> = {};
    for (const key in element.dataset) {
      if (Object.prototype.hasOwnProperty.call(element.dataset, key)) {
        dataset[key] = element.dataset[key] || '';
      }
    }

    return {
      elementId: element.id || '',
      classList: Array.from(element.classList),
      dataset,
    };
  }

  /**
   * Compute the clip rectangle from ancestor overflow clipping.
   * Walks from element's parent up to the document element.
   */
  private getAncestorClipRect(element: Element): Bounds | null {
    let clipRect: Bounds | null = null;
    let current: Element | null = element.parentElement;

    while (current && current !== document.documentElement) {
      const style = getComputedStyle(current);
      const clipsX = style.overflowX !== 'visible' && style.overflowX !== '';
      const clipsY = style.overflowY !== 'visible' && style.overflowY !== '';

      if (clipsX || clipsY) {
        const rect = current.getBoundingClientRect();
        const ancestorClip: Bounds = {
          x: clipsX ? rect.x : -1e6,
          y: clipsY ? rect.y : -1e6,
          width: clipsX ? rect.width : 2e6,
          height: clipsY ? rect.height : 2e6,
        };

        clipRect = clipRect === null ? ancestorClip : intersectBounds(clipRect, ancestorClip);

        if (clipRect.width <= 0 || clipRect.height <= 0) {
          return { x: clipRect.x, y: clipRect.y, width: 0, height: 0 };
        }
      }

      current = current.parentElement;
    }

    return clipRect;
  }

  /**
   * Get occlusion information for an element.
   * Always computes ancestor overflow clip bounds.
   * Only runs elementFromPoint detection when detectOcclusion is enabled.
   */
  private getOcclusion(
    element: Element,
    visibility: ElementVisibility,
    detectOcclusion: boolean,
  ): OcclusionInfo {
    const clipBounds = this.getAncestorClipRect(element);

    if (!detectOcclusion || !visibility.isVisible || !visibility.visibleBounds) {
      return { clipBounds, occluders: [] };
    }

    const vb = visibility.visibleBounds;
    const occluderMap = new Map<Element, OccluderRect>();

    // Grid sampling with ~20px step, always include edges
    const stepX = Math.min(20, vb.width / 2);
    const stepY = Math.min(20, vb.height / 2);

    // Generate sample points
    const xPoints: number[] = [];
    const yPoints: number[] = [];

    for (let x = vb.x; x <= vb.x + vb.width; x += stepX) {
      xPoints.push(x);
    }
    // Ensure right edge is included
    if (xPoints[xPoints.length - 1] < vb.x + vb.width - 0.5) {
      xPoints.push(vb.x + vb.width - 0.5);
    }

    for (let y = vb.y; y <= vb.y + vb.height; y += stepY) {
      yPoints.push(y);
    }
    // Ensure bottom edge is included
    if (yPoints[yPoints.length - 1] < vb.y + vb.height - 0.5) {
      yPoints.push(vb.y + vb.height - 0.5);
    }

    for (const x of xPoints) {
      for (const y of yPoints) {
        // Offset slightly inward to avoid edge issues
        const sampleX = Math.max(vb.x + 0.5, Math.min(x, vb.x + vb.width - 0.5));
        const sampleY = Math.max(vb.y + 0.5, Math.min(y, vb.y + vb.height - 0.5));

        const topEl = document.elementFromPoint(sampleX, sampleY);
        if (!topEl) continue;

        // Check if the hit element is the tracked element or one of its descendants
        if (topEl === element || element.contains(topEl)) continue;

        // Also skip if the tracked element contains the hit element (shouldn't happen with above check, but be safe)
        if (topEl.contains(element)) continue;

        // This element is an occluder
        if (!occluderMap.has(topEl)) {
          const occRect = topEl.getBoundingClientRect();
          // Intersect occluder rect with the visible bounds to get the actual occlusion area
          const occBounds = intersectBounds(
            { x: occRect.x, y: occRect.y, width: occRect.width, height: occRect.height },
            vb,
          );

          if (occBounds.width > 0 && occBounds.height > 0) {
            occluderMap.set(topEl, {
              elementTag: topEl.tagName.toLowerCase(),
              elementId: (topEl as HTMLElement).id || '',
              bounds: occBounds,
            });
          }
        }
      }
    }

    return {
      clipBounds,
      occluders: Array.from(occluderMap.values()),
    };
  }

  /**
   * Get element visibility information
   */
  private getVisibility(element: Element, domRect: DOMRect): ElementVisibility {
    const computedStyle = getComputedStyle(element);

    // Check for display: none or visibility: hidden
    if (computedStyle.display === 'none') {
      return {
        isVisible: false,
        isFullyVisible: false,
        visibleBounds: null,
        hiddenReason: 'hidden',
      };
    }

    if (computedStyle.visibility === 'hidden') {
      return {
        isVisible: false,
        isFullyVisible: false,
        visibleBounds: null,
        hiddenReason: 'hidden',
      };
    }

    // Check if size is 0
    if (domRect.width === 0 || domRect.height === 0) {
      return {
        isVisible: false,
        isFullyVisible: false,
        visibleBounds: null,
        hiddenReason: 'collapsed',
      };
    }

    // Build element bounds and viewport bounds
    const elementBounds: Bounds = {
      x: domRect.x,
      y: domRect.y,
      width: domRect.width,
      height: domRect.height,
    };
    const viewportBounds: Bounds = {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };

    // Element ∩ viewport
    let clipped = intersectBounds(elementBounds, viewportBounds);

    // Intersect with ancestor overflow clip rect (if any)
    const ancestorClip = this.getAncestorClipRect(element);
    if (ancestorClip !== null) {
      clipped = intersectBounds(clipped, ancestorClip);
    }

    // Completely outside visible area
    if (clipped.width === 0 || clipped.height === 0) {
      return {
        isVisible: false,
        isFullyVisible: false,
        visibleBounds: null,
        hiddenReason: 'offscreen',
      };
    }

    // Use epsilon for floating-point comparison
    const EPS = 0.01;
    const isFullyVisible =
      Math.abs(clipped.x - elementBounds.x) < EPS &&
      Math.abs(clipped.y - elementBounds.y) < EPS &&
      Math.abs(clipped.width - elementBounds.width) < EPS &&
      Math.abs(clipped.height - elementBounds.height) < EPS;

    return {
      isVisible: true,
      isFullyVisible,
      visibleBounds: {
        x: clipped.x,
        y: clipped.y,
        width: clipped.width,
        height: clipped.height,
      },
      hiddenReason: isFullyVisible ? undefined : 'clipped',
    };
  }

  /**
   * Get element style information
   */
  private getStyles(style: CSSStyleDeclaration): ElementStyles {
    return {
      boxSizing: style.boxSizing as 'content-box' | 'border-box',
      padding: this.parseSpacing(style, 'padding'),
      margin: this.parseSpacing(style, 'margin'),
      border: {
        width: {
          top: parseFloat(style.borderTopWidth) || 0,
          right: parseFloat(style.borderRightWidth) || 0,
          bottom: parseFloat(style.borderBottomWidth) || 0,
          left: parseFloat(style.borderLeftWidth) || 0,
        },
        radius: {
          topLeft: style.borderTopLeftRadius,
          topRight: style.borderTopRightRadius,
          bottomRight: style.borderBottomRightRadius,
          bottomLeft: style.borderBottomLeftRadius,
        },
      },
      transform: style.transform === 'none' ? null : style.transform,
      transformOrigin: style.transformOrigin,
      overflow: {
        x: style.overflowX,
        y: style.overflowY,
      },
      clipPath: style.clipPath === 'none' ? null : style.clipPath,
      display: style.display,
      opacity: parseFloat(style.opacity) || 1,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      position: style.position,
      outline: {
        width: parseFloat(style.outlineWidth) || 0,
        offset: parseFloat(style.outlineOffset) || 0,
      },
      boxShadow: style.boxShadow === 'none' ? undefined : style.boxShadow,
      filter: style.filter === 'none' ? undefined : style.filter,
    };
  }

  /**
   * Parse spacing properties
   */
  private parseSpacing(style: CSSStyleDeclaration, property: 'padding' | 'margin'): Spacing {
    return {
      top: parseFloat(style.getPropertyValue(`${property}-top`)) || 0,
      right: parseFloat(style.getPropertyValue(`${property}-right`)) || 0,
      bottom: parseFloat(style.getPropertyValue(`${property}-bottom`)) || 0,
      left: parseFloat(style.getPropertyValue(`${property}-left`)) || 0,
    };
  }

  /**
   * Get element scroll state
   */
  private getScroll(element: Element): ElementRect['scroll'] | undefined {
    if (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight) {
      return {
        top: element.scrollTop,
        left: element.scrollLeft,
        width: element.scrollWidth,
        height: element.scrollHeight,
      };
    }
    return undefined;
  }

  /**
   * Get scroll state from the scroll container (or window if none specified)
   */
  private getContainerScroll(): TrackerMessage['containerScroll'] {
    if (this.scrollContainer) {
      return {
        scrollX: this.scrollContainer.scrollLeft,
        scrollY: this.scrollContainer.scrollTop,
        scrollWidth: this.scrollContainer.scrollWidth,
        scrollHeight: this.scrollContainer.scrollHeight,
      };
    }
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };
  }

  /**
   * Send update message to host page
   */
  private sendUpdate(
    action: TrackerMessage['action'],
    elements: ElementRect[],
    updateDuration?: number,
  ): void {
    const message: TrackerMessage = {
      type: MESSAGE_TYPE,
      action,
      elements,
      containerScroll: this.getContainerScroll(),
      updateDuration,
    };

    // Primary dispatch
    if (this.onMessage) {
      try {
        this.onMessage(message);
      } catch (error) {
        console.error('Error in onMessage callback:', error);
      }
    } else {
      try {
        this.targetWindow.postMessage(message, this.targetOrigin);
      } catch (error) {
        console.error('Failed to send message to parent window:', error);
      }
    }

    // Additional listeners (always called after primary dispatch)
    for (const listener of this.messageListeners) {
      try {
        listener(message);
      } catch (error) {
        console.error('Error in message listener:', error);
      }
    }
  }
}

export default ElementTracker;
