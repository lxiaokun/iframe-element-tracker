import {
  ElementRect,
  ElementStyles,
  ElementVisibility,
  ElementAttributes,
  Bounds,
  Spacing,
  TrackerMessage,
  MESSAGE_TYPE,
} from '../shared';

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
}

/**
 * ElementTracker configuration options
 */
export interface TrackerOptions {
  /** Target window, defaults to window.parent */
  targetWindow?: Window;
  /** Target origin, defaults to '*' */
  targetOrigin?: string;
  /** Throttle delay in milliseconds, defaults to 16ms */
  throttleDelay?: number;
  /** Direct message callback, bypasses postMessage when provided */
  onMessage?: (message: TrackerMessage) => void;
}

/**
 * Internal record for a tracked element
 */
interface TrackedElement {
  element: Element;
  id: string;
  metadata?: Record<string, unknown>;
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

  constructor(options: TrackerOptions = {}) {
    this.targetWindow = options.targetWindow ?? window.parent;
    this.targetOrigin = options.targetOrigin ?? '*';
    this.onMessage = options.onMessage ?? null;

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

    // Bindvents
    window.addEventListener('scroll', this.scrollHandler, { passive: true, capture: true });
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

    window.removeEventListener('scroll', this.scrollHandler, { capture: true });
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

    const elements: ElementRect[] = [];

    for (const tracked of this.trackedElements.values()) {
      const rect = this.getElementRect(tracked);
      tracked.lastRect = rect;
      elements.push(rect);
    }

    this.sendUpdate('update', elements);
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

    // Calculate intersection with viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const visibleX = Math.max(0, domRect.x);
    const visibleY = Math.max(0, domRect.y);
    const visibleRight = Math.min(viewportWidth, domRect.x + domRect.width);
    const visibleBottom = Math.min(viewportHeight, domRect.y + domRect.height);

    const visibleWidth = Math.max(0, visibleRight - visibleX);
    const visibleHeight = Math.max(0, visibleBottom - visibleY);

    // Completely outside viewport
    if (visibleWidth === 0 || visibleHeight === 0) {
      return {
        isVisible: false,
        isFullyVisible: false,
        visibleBounds: null,
        hiddenReason: 'offscreen',
      };
    }

    const isFullyVisible =
      domRect.x >= 0 &&
      domRect.y >= 0 &&
      domRect.x + domRect.width <= viewportWidth &&
      domRect.y + domRect.height <= viewportHeight;

    return {
      isVisible: true,
      isFullyVisible,
      visibleBounds: {
        x: visibleX,
        y: visibleY,
        width: visibleWidth,
        height: visibleHeight,
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
   * Send update message to host page
   */
  private sendUpdate(action: TrackerMessage['action'], elements: ElementRect[]): void {
    const message: TrackerMessage = {
      type: MESSAGE_TYPE,
      action,
      elements,
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
