import type { ElementRect, ElementStyles, ScaleContext } from '../../src/shared';

/**
 * Create a complete ElementRect with sensible defaults.
 * Pass partial overrides to customize specific fields.
 */
export function createElementRect(
  overrides: Partial<Omit<ElementRect, 'styles'>> & { styles?: Partial<ElementStyles> } = {}
): ElementRect {
  const defaultStyles: ElementStyles = {
    boxSizing: 'border-box',
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    border: {
      width: { top: 0, right: 0, bottom: 0, left: 0 },
      radius: {
        topLeft: '0px',
        topRight: '0px',
        bottomRight: '0px',
        bottomLeft: '0px',
      },
    },
    transform: null,
    transformOrigin: '100px 50px',
    overflow: { x: 'visible', y: 'visible' },
    clipPath: null,
    display: 'block',
    opacity: 1,
    zIndex: 'auto',
    pointerEvents: 'auto',
    position: 'static',
  };

  return {
    id: overrides.id ?? 'test-element',
    timestamp: overrides.timestamp ?? Date.now(),
    attributes: {
      elementId: '',
      classList: [],
      dataset: {},
      ...overrides.attributes,
    },
    bounds: {
      x: 100,
      y: 50,
      width: 200,
      height: 100,
      ...overrides.bounds,
    },
    visibility: {
      isVisible: true,
      isFullyVisible: true,
      visibleBounds: {
        x: 100,
        y: 50,
        width: 200,
        height: 100,
      },
      ...overrides.visibility,
    },
    styles: {
      ...defaultStyles,
      ...overrides.styles,
    },
    metadata: overrides.metadata,
  };
}

/**
 * Create a ScaleContext with identity (no-op) defaults.
 * All scales are 1, all offsets are 0.
 */
export function createScaleContext(
  overrides: Partial<ScaleContext> = {}
): ScaleContext {
  return {
    iframeScale: { scaleX: 1, scaleY: 1 },
    iframeZoom: { scaleX: 1, scaleY: 1 },
    iframeTransform: { scaleX: 1, scaleY: 1 },
    iframeTranslate: { left: 0, top: 0 },
    ancestorScale: { scaleX: 1, scaleY: 1 },
    combinedScale: { scaleX: 1, scaleY: 1 },
    iframeMargin: { left: 0, top: 0 },
    iframeBorderPadding: { left: 0, top: 0 },
    containerOffset: { left: 0, top: 0 },
    ...overrides,
  };
}
