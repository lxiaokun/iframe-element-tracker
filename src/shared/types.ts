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
  /** Actual visible area (after clipping by viewport and ancestor overflow), null if not visible */
  visibleBounds: Bounds | null;
  /** Reason for being hidden */
  hiddenReason?: 'offscreen' | 'hidden' | 'collapsed' | 'clipped';
}

/**
 * Single occluder rectangle (an element covering part of the tracked element)
 */
export interface OccluderRect {
  /** Tag name of the occluding element (for debugging) */
  elementTag: string;
  /** ID of the occluding element (for debugging) */
  elementId: string;
  /** Occluder bounds in iframe viewport coordinates (intersected with visible area) */
  bounds: Bounds;
}

/**
 * Occlusion information for a tracked element
 */
export interface OcclusionInfo {
  /** Ancestor overflow clip bounds (single rect), null if no clipping ancestors */
  clipBounds: Bounds | null;
  /** List of elements covering the tracked element (only populated when detectOcclusion is enabled) */
  occluders: OccluderRect[];
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
 * DOM element attributes (id, class, dataset)
 */
export interface ElementAttributes {
  /** Element's id attribute */
  elementId: string;
  /** Element's class list */
  classList: string[];
  /** Element's data-* attributes */
  dataset: Record<string, string>;
}

/**
 * Complete information of a tracked element
 */
export interface ElementRect {
  /** Unique tracker identifier */
  id: string;
  /** Update timestamp */
  timestamp: number;
  /** DOM element attributes (id, class, dataset) */
  attributes: ElementAttributes;
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
  /** Occlusion information (ancestor clipping + z-index occlusion when opt-in) */
  occlusion?: OcclusionInfo;
}

/**
 * Message action type
 */
export type MessageAction = 'init' | 'update' | 'remove';

/**
 * Scroll container state (window or user-specified element)
 */
export interface ContainerScroll {
  scrollX: number;
  scrollY: number;
  scrollWidth: number;
  scrollHeight: number;
}

/**
 * Message structure from iframe to host page
 */
export interface TrackerMessage {
  /** Message type identifier */
  type: string;
  /** Action type */
  action: MessageAction;
  /** Element information list */
  elements: ElementRect[];
  /** Scroll container state (window or user-specified scrollContainer) */
  containerScroll?: ContainerScroll;
  /** Duration of the tracker's performUpdate() in milliseconds (for benchmarking) */
  updateDuration?: number;
}

// ==================== Overlay Positioner Types ====================

/**
 * 2D scale factor
 */
export interface Scale2D {
  scaleX: number;
  scaleY: number;
}

/**
 * 2D offset (left/top)
 */
export interface Offset2D {
  left: number;
  top: number;
}

/**
 * Complete overlay style output ready to apply to an element
 */
export interface OverlayStyle {
  /** CSS left value in pixels */
  left: number;
  /** CSS top value in pixels */
  top: number;
  /** CSS width value in pixels */
  width: number;
  /** CSS height value in pixels */
  height: number;
  /** Scaled border-radius CSS string */
  borderRadius: string;
  /** Transform from tracked element (if any) */
  transform: string | null;
  /** Transform origin from tracked element */
  transformOrigin: string;
  /** CSS clip-path for ancestor overflow clipping and z-index occlusion. null = no clipping */
  clipPath: string | null;
}

/**
 * Context containing all scale and offset values for coordinate transformation
 */
export interface ScaleContext {
  /** Scale factor applied to iframe itself (transform + zoom combined) */
  iframeScale: Scale2D;
  /** Scale factor from iframe's CSS zoom only (affects margin) */
  iframeZoom: Scale2D;
  /** Scale factor from iframe's CSS transform only (does not affect margin) */
  iframeTransform: Scale2D;
  /** Translate offset from iframe's CSS transform (in host pixels) */
  iframeTranslate: Offset2D;
  /** Scale factor from ancestor transforms/zoom */
  ancestorScale: Scale2D;
  /** Combined scale (iframe * ancestor) */
  combinedScale: Scale2D;
  /** Iframe's margin offset (outside iframe, scaled by zoom but not transform) */
  iframeMargin: Offset2D;
  /** Iframe's border + padding offset (inside iframe, scaled by combinedScale) */
  iframeBorderPadding: Offset2D;
  /** Container's CSS position offset */
  containerOffset: Offset2D;
}

/**
 * Configuration options for OverlayPositioner
 */
export interface OverlayPositionerOptions {
  /** The overlay container element (where overlays are appended) */
  container: HTMLElement;
  /** The iframe element being tracked */
  iframe: HTMLIFrameElement;
  /**
   * Extra margin (CSS px) for clip-path inset on unclipped sides,
   * allowing labels/toolbars to overflow beyond the element boundary.
   * Default: 100.
   */
  clipOverflowMargin?: number;
}
