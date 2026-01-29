/**
 * Spacing type for padding, margin, border-width
 */
export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Rectangle bounds
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Element visibility information
 */
export interface ElementVisibility {
  /** Whether the element is visible in the viewport */
  isVisible: boolean;
  /** Whether fully visible (not clipped) */
  isFullyVisible: boolean;
  /** Actual visible area (after clipping), null if not visible */
  visibleBounds: Bounds | null;
  /** Reason for being hidden */
  hiddenReason?: 'offscreen' | 'hidden' | 'collapsed' | 'clipped';
}

/**
 * Element style information
 */
export interface ElementStyles {
  // Box model
  boxSizing: 'content-box' | 'border-box';
  padding: Spacing;
  margin: Spacing;
  border: {
    width: Spacing;
    radius: {
      topLeft: string;
      topRight: string;
      bottomRight: string;
      bottomLeft: string;
    };
  };

  // Transform
  transform: string | null;
  transformOrigin: string;

  // Clipping and overflow
  overflow: { x: string; y: string };
  clipPath: string | null;

  // Display and stacking
  display: string;
  opacity: number;
  zIndex: string;
  pointerEvents: string;
  position: string;

  // Optional visual effects
  outline?: { width: number; offset: number };
  boxShadow?: string;
  filter?: string;
}

/**
 * Element scroll state
 */
export interface ElementScroll {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Complete information of a tracked element
 */
export interface ElementRect {
  /** Unique element identifier */
  id: string;
  /** Update timestamp */
  timestamp: number;
  /** Position and size (from getBoundingClientRect) */
  bounds: Bounds;
  /** Visibility information */
  visibility: ElementVisibility;
  /** CSS style information */
  styles: ElementStyles;
  /** Scroll state (if element is scrollable) */
  scroll?: ElementScroll;
  /** User-defined custom data */
  metadata?: Record<string, unknown>;
}

/**
 * Message action type
 */
export type MessageAction = 'init' | 'update' | 'remove';

/**
 * Message structure from iframe to host page
 */
export interface OverlayMessage {
  /** Message type identifier */
  type: string;
  /** Action type */
  action: MessageAction;
  /** Element information list */
  elements: ElementRect[];
}
