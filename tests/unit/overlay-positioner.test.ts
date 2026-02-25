import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OverlayPositioner } from '../../src/overlay-positioner';
import { createElementRect, createScaleContext } from '../helpers/fixtures';
import {
  createMockComputedStyle,
} from '../helpers/dom-mocks';

describe('OverlayPositioner', () => {
  let iframe: HTMLIFrameElement;
  let container: HTMLElement;
  let positioner: OverlayPositioner;

  beforeEach(() => {
    iframe = document.createElement('iframe');
    container = document.createElement('div');
    document.body.appendChild(iframe);
    document.body.appendChild(container);

    positioner = new OverlayPositioner({ iframe, container });
  });

  afterEach(() => {
    iframe.remove();
    container.remove();
    vi.restoreAllMocks();
  });

  // ==================== transformCoordinates ====================

  describe('transformCoordinates', () => {
    it('returns original coordinates with identity context', () => {
      const ctx = createScaleContext();
      const result = positioner.transformCoordinates(100, 50, ctx);
      expect(result.left).toBe(100);
      expect(result.top).toBe(50);
    });

    it('scales margin by iframeZoom * ancestorScale (not by iframeTransform)', () => {
      const ctx = createScaleContext({
        iframeZoom: { scaleX: 0.8, scaleY: 0.8 },
        iframeTransform: { scaleX: 1, scaleY: 1 },
        iframeScale: { scaleX: 0.8, scaleY: 0.8 },
        ancestorScale: { scaleX: 1, scaleY: 1 },
        combinedScale: { scaleX: 0.8, scaleY: 0.8 },
        iframeMargin: { left: 20, top: 20 },
      });

      const result = positioner.transformCoordinates(0, 0, ctx);
      // margin: 20 * 0.8 (iframeZoom) * 1 (ancestorScale) = 16
      // content: (0 + 0) * 0.8 (combinedScale) = 0
      // CSS: 16 / 1 (ancestorScale) = 16
      expect(result.left).toBe(16);
      expect(result.top).toBe(16);
    });

    it('iframe transform does NOT scale margin', () => {
      const ctx = createScaleContext({
        iframeZoom: { scaleX: 1, scaleY: 1 },
        iframeTransform: { scaleX: 0.8, scaleY: 0.8 },
        iframeScale: { scaleX: 0.8, scaleY: 0.8 },
        ancestorScale: { scaleX: 1, scaleY: 1 },
        combinedScale: { scaleX: 0.8, scaleY: 0.8 },
        iframeMargin: { left: 20, top: 20 },
      });

      const result = positioner.transformCoordinates(0, 0, ctx);
      // margin: 20 * 1 (iframeZoom) * 1 (ancestorScale) = 20
      // content: (0 + 0) * 0.8 = 0
      // CSS: 20 / 1 = 20
      expect(result.left).toBe(20);
      expect(result.top).toBe(20);
    });

    it('handles zoom + transform combined scenario', () => {
      const ctx = createScaleContext({
        iframeZoom: { scaleX: 0.8, scaleY: 0.8 },
        iframeTransform: { scaleX: 0.5, scaleY: 0.5 },
        iframeScale: { scaleX: 0.4, scaleY: 0.4 },
        ancestorScale: { scaleX: 1, scaleY: 1 },
        combinedScale: { scaleX: 0.4, scaleY: 0.4 },
        iframeMargin: { left: 10, top: 10 },
      });

      const result = positioner.transformCoordinates(100, 50, ctx);
      // marginScale = 0.8 * 1 = 0.8
      // margin rendered: 10 * 0.8 = 8
      // content rendered: (0 + 100) * 0.4 = 40
      // total rendered: 48
      // CSS: 48 / 1 = 48
      expect(result.left).toBe(48);
      // margin: 10 * 0.8 = 8, content: 50 * 0.4 = 20, total: 28
      expect(result.top).toBe(28);
    });

    it('subtracts container offset', () => {
      const ctx = createScaleContext({
        containerOffset: { left: -50, top: -50 },
      });

      const result = positioner.transformCoordinates(100, 50, ctx);
      // rendered: 100 - (-50) = 150
      // CSS: 150 / 1 = 150
      expect(result.left).toBe(150);
      expect(result.top).toBe(100);
    });

    it('handles border + padding offset', () => {
      const ctx = createScaleContext({
        iframeBorderPadding: { left: 2, top: 2 },
      });

      const result = positioner.transformCoordinates(100, 50, ctx);
      // content: (2 + 100) * 1 = 102
      expect(result.left).toBe(102);
      expect(result.top).toBe(52);
    });

    it('divides by ancestorScale to produce CSS values', () => {
      const ctx = createScaleContext({
        ancestorScale: { scaleX: 2, scaleY: 2 },
        combinedScale: { scaleX: 2, scaleY: 2 },
      });

      const result = positioner.transformCoordinates(100, 50, ctx);
      // rendered: 100 * 2 = 200
      // CSS: 200 / 2 = 100
      expect(result.left).toBe(100);
      expect(result.top).toBe(50);
    });
  });

  // ==================== transformDimensions ====================

  describe('transformDimensions', () => {
    it('returns original dimensions with identity context', () => {
      const ctx = createScaleContext();
      const result = positioner.transformDimensions(200, 100, ctx);
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it('scales by combinedScale and divides by ancestorScale', () => {
      const ctx = createScaleContext({
        combinedScale: { scaleX: 0.8, scaleY: 0.8 },
        ancestorScale: { scaleX: 1, scaleY: 1 },
      });

      const result = positioner.transformDimensions(200, 100, ctx);
      expect(result.width).toBeCloseTo(160);
      expect(result.height).toBeCloseTo(80);
    });

    it('handles ancestor scale correctly', () => {
      const ctx = createScaleContext({
        combinedScale: { scaleX: 1.5, scaleY: 1.5 },
        ancestorScale: { scaleX: 1.5, scaleY: 1.5 },
      });

      const result = positioner.transformDimensions(200, 100, ctx);
      // rendered: 200 * 1.5 = 300, CSS: 300 / 1.5 = 200
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });
  });

  // ==================== scaleBorderRadius ====================

  describe('scaleBorderRadius', () => {
    it('scales all four corners by the given scale factor', () => {
      const radius = {
        topLeft: '10px',
        topRight: '20px',
        bottomRight: '30px',
        bottomLeft: '40px',
      };

      const result = positioner.scaleBorderRadius(radius, 0.5);
      expect(result).toBe('5px 10px 15px 20px');
    });

    it('handles 0px values', () => {
      const radius = {
        topLeft: '0px',
        topRight: '0px',
        bottomRight: '0px',
        bottomLeft: '0px',
      };

      const result = positioner.scaleBorderRadius(radius, 2);
      expect(result).toBe('0px 0px 0px 0px');
    });

    it('handles scale factor of 1 (identity)', () => {
      const radius = {
        topLeft: '8px',
        topRight: '8px',
        bottomRight: '8px',
        bottomLeft: '8px',
      };

      const result = positioner.scaleBorderRadius(radius, 1);
      expect(result).toBe('8px 8px 8px 8px');
    });

    it('preserves percentage values without scaling', () => {
      const radius = {
        topLeft: '50%',
        topRight: '50%',
        bottomRight: '50%',
        bottomLeft: '50%',
      };

      const result = positioner.scaleBorderRadius(radius, 0.5);
      expect(result).toBe('50% 50% 50% 50%');
    });

    it('handles mixed px and percentage values', () => {
      const radius = {
        topLeft: '10px',
        topRight: '50%',
        bottomRight: '20px',
        bottomLeft: '50%',
      };

      const result = positioner.scaleBorderRadius(radius, 2);
      expect(result).toBe('20px 50% 40px 50%');
    });
  });

  // ==================== getOverlayStyle ====================

  describe('getOverlayStyle', () => {
    beforeEach(() => {
      vi.spyOn(positioner, 'getScaleContext').mockReturnValue(
        createScaleContext()
      );
    });

    it('returns null for invisible elements', () => {
      const rect = createElementRect({
        visibility: { isVisible: false, isFullyVisible: false, visibleBounds: null },
      });
      const result = positioner.getOverlayStyle(rect);
      expect(result).toBeNull();
    });

    it('returns complete style object for visible elements', () => {
      const rect = createElementRect({
        bounds: { x: 100, y: 50, width: 200, height: 100 },
      });

      const result = positioner.getOverlayStyle(rect);
      expect(result).not.toBeNull();
      expect(result!.left).toBe(100);
      expect(result!.top).toBe(50);
      expect(result!.width).toBe(200);
      expect(result!.height).toBe(100);
      expect(result!.borderRadius).toBeDefined();
    });

    it('includes transform and transformOrigin from element styles', () => {
      const rect = createElementRect({
        styles: {
          transform: 'rotate(45deg)',
          transformOrigin: 'center center',
        },
      });

      const result = positioner.getOverlayStyle(rect);
      expect(result).not.toBeNull();
      expect(result!.transform).toBe('rotate(45deg)');
      expect(result!.transformOrigin).toBe('center center');
    });
  });

  // ==================== applyOverlayStyle ====================

  describe('applyOverlayStyle', () => {
    let overlay: HTMLElement;

    beforeEach(() => {
      overlay = document.createElement('div');
      vi.spyOn(positioner, 'getScaleContext').mockReturnValue(createScaleContext());
    });

    it('hides overlay for invisible elements', () => {
      const rect = createElementRect({
        visibility: { isVisible: false, isFullyVisible: false, visibleBounds: null },
      });

      positioner.applyOverlayStyle(overlay, rect);
      expect(overlay.style.display).toBe('none');
    });

    it('applies correct style properties for visible elements', () => {
      const rect = createElementRect({
        bounds: { x: 100, y: 50, width: 200, height: 100 },
      });

      positioner.applyOverlayStyle(overlay, rect);
      expect(overlay.style.display).toBe('block');
      expect(overlay.style.left).toBe('100px');
      expect(overlay.style.top).toBe('50px');
      expect(overlay.style.width).toBe('200px');
      expect(overlay.style.height).toBe('100px');
    });

    it('applies transform when element has one', () => {
      const rect = createElementRect({
        styles: {
          transform: 'rotate(45deg)',
          transformOrigin: 'center center',
        },
      });

      positioner.applyOverlayStyle(overlay, rect);
      expect(overlay.style.transform).toBe('rotate(45deg)');
      expect(overlay.style.transformOrigin).toBe('center center');
    });

    it('clears transform when element has none', () => {
      overlay.style.transform = 'rotate(45deg)';

      const rect = createElementRect({
        styles: { transform: null },
      });

      positioner.applyOverlayStyle(overlay, rect);
      expect(overlay.style.transform).toBe('');
    });
  });

  // ==================== getIframeScaleSeparate ====================

  describe('getIframeScaleSeparate', () => {
    it('parses CSS zoom value', () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue(
        createMockComputedStyle({ zoom: '0.8' })
      );

      const { zoom, transform } = positioner.getIframeScaleSeparate();
      expect(zoom.scaleX).toBe(0.8);
      expect(zoom.scaleY).toBe(0.8);
      expect(transform.scaleX).toBe(1);
      expect(transform.scaleY).toBe(1);
    });

    it('parses matrix() transform', () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue(
        createMockComputedStyle({ transform: 'matrix(0.5, 0, 0, 0.5, 0, 0)' })
      );

      const { zoom, transform } = positioner.getIframeScaleSeparate();
      expect(zoom.scaleX).toBe(1);
      expect(transform.scaleX).toBe(0.5);
      expect(transform.scaleY).toBe(0.5);
    });

    it('returns identity when no transform or zoom', () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue(
        createMockComputedStyle({ transform: 'none', zoom: '1' })
      );

      const { zoom, transform } = positioner.getIframeScaleSeparate();
      expect(zoom.scaleX).toBe(1);
      expect(zoom.scaleY).toBe(1);
      expect(transform.scaleX).toBe(1);
      expect(transform.scaleY).toBe(1);
    });

    it('handles both zoom and transform together', () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue(
        createMockComputedStyle({
          zoom: '0.8',
          transform: 'matrix(0.5, 0, 0, 0.5, 0, 0)',
        })
      );

      const { zoom, transform } = positioner.getIframeScaleSeparate();
      expect(zoom.scaleX).toBe(0.8);
      expect(transform.scaleX).toBe(0.5);
      expect(transform.scaleY).toBe(0.5);
    });
  });

  // ==================== getAncestorScale ====================

  describe('getAncestorScale', () => {
    it('accumulates ancestor zoom and transform', () => {
      // Create a DOM hierarchy: body > wrapper (zoom:2) > container
      const wrapper = document.createElement('div');
      wrapper.style.zoom = '2';
      document.body.appendChild(wrapper);
      wrapper.appendChild(container);

      // Need to mock getComputedStyle for the wrapper
      const originalGetComputedStyle = window.getComputedStyle;
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
        if (el === wrapper) {
          return createMockComputedStyle({ zoom: '2', transform: 'none' });
        }
        return originalGetComputedStyle(el);
      });

      const scale = positioner.getAncestorScale(wrapper);
      expect(scale.scaleX).toBe(2);
      expect(scale.scaleY).toBe(2);

      wrapper.remove();
    });

    it('stops at body element', () => {
      // Container is directly under body - should return identity
      document.body.appendChild(container);

      vi.spyOn(window, 'getComputedStyle').mockReturnValue(
        createMockComputedStyle({ zoom: '1', transform: 'none' })
      );

      const scale = positioner.getAncestorScale();
      expect(scale.scaleX).toBe(1);
      expect(scale.scaleY).toBe(1);
    });
  });

  // ==================== utility methods ====================

  describe('utility methods', () => {
    it('setContainer updates the container reference', () => {
      const newContainer = document.createElement('div');
      positioner.setContainer(newContainer);
      expect(positioner.getContainer()).toBe(newContainer);
    });

    it('setIframe updates the iframe reference', () => {
      const newIframe = document.createElement('iframe');
      positioner.setIframe(newIframe);
      expect(positioner.getIframe()).toBe(newIframe);
    });
  });
});
