import {
  ElementRect,
  OverlayMessage,
  MessageAction,
  MESSAGE_TYPE,
} from '../shared';

/**
 * Event callback type
 */
export type EventCallback = (elements: ElementRect[]) => void;

/**
 * ReceiverSDK configuration options
 */
export interface ReceiverOptions {
  /** Allowed origin, defaults to '*' (accept all origins) */
  allowedOrigin?: string;
}

/**
 * ReceiverSDK - Used in host pages
 * Receives element tracking information sent from iframe pages
 */
export class ReceiverSDK {
  private iframe: HTMLIFrameElement;
  private allowedOrigin: string;
  private elements: Map<string, ElementRect> = new Map();
  private listeners: Map<MessageAction, Set<EventCallback>> = new Map();
  private messageHandler: (event: MessageEvent) => void;
  private isDestroyed = false;

  constructor(iframe: HTMLIFrameElement, options: ReceiverOptions = {}) {
    this.iframe = iframe;
    this.allowedOrigin = options.allowedOrigin ?? '*';

    // Initialize event listener sets
    this.listeners.set('init', new Set());
    this.listeners.set('update', new Set());
    this.listeners.set('remove', new Set());

    // Message handler function
    this.messageHandler = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    // Listen for message events
    window.addEventListener('message', this.messageHandler);
  }

  /**
   * Listen for events
   */
  on(event: MessageAction, callback: EventCallback): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.add(callback);
    }
  }

  /**
   * Remove event listener
   */
  off(event: MessageAction, callback: EventCallback): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Get all currently tracked elements
   */
  getElements(): Map<string, ElementRect> {
    return new Map(this.elements);
  }

  /**
   * Get a single element
   */
  getElement(id: string): ElementRect | undefined {
    return this.elements.get(id);
  }

  /**
   * Get the bound iframe element
   */
  getIframe(): HTMLIFrameElement {
    return this.iframe;
  }

  /**
   * Get iframe position in the host page
   */
  getIframeBounds(): DOMRect {
    return this.iframe.getBoundingClientRect();
  }

  /**
   * Transform iframe coordinates to host page coordinates
   */
  transformToHostCoordinates(
    iframeX: number,
    iframeY: number
  ): { x: number; y: number } {
    const iframeBounds = this.getIframeBounds();
    return {
      x: iframeBounds.x + iframeX,
      y: iframeBounds.y + iframeY,
    };
  }

  /**
   * Get element bounds in host page coordinates
   */
  getElementHostBounds(id: string): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    const element = this.elements.get(id);
    if (!element) {
      return null;
    }

    const hostCoords = this.transformToHostCoordinates(
      element.bounds.x,
      element.bounds.y
    );

    return {
      x: hostCoords.x,
      y: hostCoords.y,
      width: element.bounds.width,
      height: element.bounds.height,
    };
  }

  /**
   * Destroy SDK and clean up all resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    window.removeEventListener('message', this.messageHandler);
    this.elements.clear();
    this.listeners.clear();
  }

  /**
   * Handle received messages
   */
  private handleMessage(event: MessageEvent): void {
    if (this.isDestroyed) {
      return;
    }

    // Validate origin
    if (this.allowedOrigin !== '*' && event.origin !== this.allowedOrigin) {
      return;
    }

    // Validate message source is the bound iframe
    if (event.source !== this.iframe.contentWindow) {
      return;
    }

    // Validate message format
    const message = event.data as OverlayMessage;
    if (!message || message.type !== MESSAGE_TYPE) {
      return;
    }

    // Handle different actions
    switch (message.action) {
      case 'init':
        this.handleInit(message.elements);
        break;
      case 'update':
        this.handleUpdate(message.elements);
        break;
      case 'remove':
        this.handleRemove(message.elements);
        break;
    }
  }

  /**
   * Handle init message
   */
  private handleInit(elements: ElementRect[]): void {
    for (const element of elements) {
      this.elements.set(element.id, element);
    }
    this.emit('init', elements);
  }

  /**
   * Handle update message
   */
  private handleUpdate(elements: ElementRect[]): void {
    for (const element of elements) {
      this.elements.set(element.id, element);
    }
    this.emit('update', elements);
  }

  /**
   * Handle remove message
   */
  private handleRemove(elements: ElementRect[]): void {
    const removed: ElementRect[] = [];
    for (const element of elements) {
      const existing = this.elements.get(element.id);
      if (existing) {
        removed.push(existing);
        this.elements.delete(element.id);
      }
    }
    if (removed.length > 0) {
      this.emit('remove', removed);
    }
  }

  /**
   * Emit event
   */
  private emit(event: MessageAction, elements: ElementRect[]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(elements);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      }
    }
  }
}

export default ReceiverSDK;
