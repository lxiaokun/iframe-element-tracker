import {
  ElementRect,
  Scale2D,
  Offset2D,
  OverlayStyle,
  ScaleContext,
  OverlayPositionerOptions,
} from '../shared';

/**
 * OverlayPositioner - Handles coordinate transformation for overlay rendering
 *
 * This class encapsulates the complex coordinate math needed to position
 * overlay elements correctly when the iframe has transforms, zoom, padding,
 * border, margin, and when the overlay container extends beyond the iframe.
 *
 * @example
 * ```typescript
 * const positioner = new OverlayPositioner({
 *   iframe: document.getElementById('my-iframe'),
 *   container: document.getElementById('overlay-container'),
 * });
 *
 * // Simple usage: apply style directly
 * positioner.applyOverlayStyle(overlayElement, elementRect);
 *
 * // Or get style values to apply manually
 * const style = positioner.getOverlayStyle(elementRect);
 * ```
 */
export class OverlayPositioner {
  private iframe: HTMLIFrameElement;
  private container: HTMLElement;

  constructor(options: OverlayPositionerOptions) {
    this.iframe = options.iframe;
    this.container = options.container;
  }

  // ==================== HIGH-LEVEL API ====================

  /**
   * Calculate the complete overlay style for an element.
   * This is the main convenience method for simple use cases.
   *
   * @param elementRect - The tracked element data from ElementReceiver
   * @returns OverlayStyle ready to apply, or null if element is not visible
   */
  getOverlayStyle(elementRect: ElementRect): OverlayStyle | null {
    if (!elementRect.visibility.isVisible) {
      return null;
    }

    const context = this.getScaleContext();
    const { bounds, styles } = elementRect;

    // Transform position
    const position = this.transformCoordinates(bounds.x, bounds.y, context);

    // Transform dimensions
    const dimensions = this.transformDimensions(bounds.width, bounds.height, context);

    // Scale border-radius
    const borderRadius = this.scaleBorderRadius(
      styles.border.radius,
      context.iframeScale.scaleX
    );

    return {
      left: position.left,
      top: position.top,
      width: dimensions.width,
      height: dimensions.height,
      borderRadius,
      transform: styles.transform,
      transformOrigin: this.scaleTransformOrigin(
        styles.transformOrigin,
        context.iframeScale.scaleX,
        context.iframeScale.scaleY
      ),
    };
  }

  /**
   * Apply calculated overlay style directly to a DOM element.
   * Convenience method that handles visibility and style application.
   *
   * @param overlay - The overlay DOM element to style
   * @param elementRect - The tracked element data from ElementReceiver
   */
  applyOverlayStyle(overlay: HTMLElement, elementRect: ElementRect): void {
    if (!elementRect.visibility.isVisible) {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'block';

    const style = this.getOverlayStyle(elementRect);
    if (!style) {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.left = `${style.left}px`;
    overlay.style.top = `${style.top}px`;
    overlay.style.width = `${style.width}px`;
    overlay.style.height = `${style.height}px`;
    overlay.style.borderRadius = style.borderRadius;

    if (style.transform) {
      overlay.style.transform = style.transform;
      overlay.style.transformOrigin = style.transformOrigin;
    } else {
      overlay.style.transform = '';
    }
  }

  // ==================== LOW-LEVEL COMPOSABLE API ====================

  /**
   * Get the complete scale context.
   * Useful when you need to perform custom calculations or batch operations.
   */
  getScaleContext(): ScaleContext {
    const { zoom: iframeZoom, transform: iframeTransform, translate: iframeTranslate } = this.getIframeScaleSeparate();
    const iframeScale = {
      scaleX: iframeZoom.scaleX * iframeTransform.scaleX,
      scaleY: iframeZoom.scaleY * iframeTransform.scaleY,
    };
    const ancestorScale = this.getAncestorScale();
    const iframeMargin = this.getIframeMargin();
    const iframeBorderPadding = this.getIframeBorderPadding();
    const containerOffset = this.getContainerOffset();

    return {
      iframeScale,
      iframeZoom,
      iframeTransform,
      iframeTranslate,
      ancestorScale,
      combinedScale: {
        scaleX: iframeScale.scaleX * ancestorScale.scaleX,
        scaleY: iframeScale.scaleY * ancestorScale.scaleY,
      },
      iframeMargin,
      iframeBorderPadding,
      containerOffset,
    };
  }

  /**
   * Get iframe's zoom and transform scale factors separately.
   * CSS zoom affects margin, but transform does not.
   * Also computes the effective translate from the transform matrix
   * and transform-origin offset.
   */
  getIframeScaleSeparate(): { zoom: Scale2D; transform: Scale2D; translate: Offset2D } {
    const style = window.getComputedStyle(this.iframe);
    const transformStr = style.transform;
    const zoomVal = parseFloat(style.zoom) || 1;

    const zoom = { scaleX: zoomVal, scaleY: zoomVal };
    const transform = { scaleX: 1, scaleY: 1 };
    let matrixTranslateX = 0;
    let matrixTranslateY = 0;

    if (transformStr && transformStr !== 'none') {
      const matrixMatch = transformStr.match(/^matrix\((.+)\)$/);
      if (matrixMatch) {
        const values = matrixMatch[1].split(',').map((v) => parseFloat(v.trim()));
        // matrix(scaleX, skewY, skewX, scaleY, translateX, translateY)
        transform.scaleX = values[0];
        transform.scaleY = values[3];
        matrixTranslateX = values[4] || 0;
        matrixTranslateY = values[5] || 0;
      }
    }

    // Compute the visual translate from transform-origin.
    // The browser's computed matrix does NOT include origin-induced offset.
    // For transform-origin (ox, oy) with scale (sx, sy), the effective
    // visual offset is: ((1-sx)*ox, (1-sy)*oy)
    let originOffsetX = 0;
    let originOffsetY = 0;
    if (transformStr && transformStr !== 'none') {
      const originStr = style.transformOrigin; // e.g. "400px 250px"
      const originParts = originStr.split(' ');
      const originX = parseFloat(originParts[0]) || 0;
      const originY = parseFloat(originParts[1]) || 0;
      originOffsetX = (1 - transform.scaleX) * originX;
      originOffsetY = (1 - transform.scaleY) * originY;
    }

    const translate = {
      left: matrixTranslateX + originOffsetX,
      top: matrixTranslateY + originOffsetY,
    };

    return { zoom, transform, translate };
  }

  /**
   * Get iframe's transform/zoom scale factor (combined).
   */
  getIframeScale(): Scale2D {
    const { zoom, transform } = this.getIframeScaleSeparate();
    return {
      scaleX: zoom.scaleX * transform.scaleX,
      scaleY: zoom.scaleY * transform.scaleY,
    };
  }

  /**
   * Get cumulative scale from ancestor transforms/zoom.
   * Walks up the DOM tree from the container's parent.
   *
   * @param fromElement - Starting element (defaults to container's parent)
   */
  getAncestorScale(fromElement?: HTMLElement): Scale2D {
    let scaleX = 1;
    let scaleY = 1;
    let element: HTMLElement | null = fromElement ?? this.container.parentElement;

    while (element && element !== document.body) {
      const style = window.getComputedStyle(element);
      const transform = style.transform;
      const zoom = parseFloat(style.zoom) || 1;

      // Apply zoom
      scaleX *= zoom;
      scaleY *= zoom;

      // Apply transform
      if (transform && transform !== 'none') {
        const matrixMatch = transform.match(/^matrix\((.+)\)$/);
        if (matrixMatch) {
          const values = matrixMatch[1].split(',').map((v) => parseFloat(v.trim()));
          scaleX *= values[0];
          scaleY *= values[3];
        }
      }

      element = element.parentElement;
    }

    return { scaleX, scaleY };
  }

  /**
   * Get iframe margin offset (outside iframe, only scaled by ancestorScale).
   */
  getIframeMargin(): Offset2D {
    const style = window.getComputedStyle(this.iframe);
    return {
      left: parseFloat(style.marginLeft) || 0,
      top: parseFloat(style.marginTop) || 0,
    };
  }

  /**
   * Get iframe border + padding offset (inside iframe, scaled by combinedScale).
   */
  getIframeBorderPadding(): Offset2D {
    const style = window.getComputedStyle(this.iframe);
    return {
      left:
        (parseFloat(style.borderLeftWidth) || 0) +
        (parseFloat(style.paddingLeft) || 0),
      top:
        (parseFloat(style.borderTopWidth) || 0) +
        (parseFloat(style.paddingTop) || 0),
    };
  }

  /**
   * Get overlay container's CSS position offset.
   */
  getContainerOffset(): Offset2D {
    const style = window.getComputedStyle(this.container);
    return {
      left: parseFloat(style.left) || 0,
      top: parseFloat(style.top) || 0,
    };
  }

  /**
   * Scale a border-radius value by the given scale factor.
   *
   * @param borderRadius - Border radius object from ElementRect.styles
   * @param scale - Scale factor to apply (typically iframeScale.scaleX)
   */
  scaleBorderRadius(
    borderRadius: ElementRect['styles']['border']['radius'],
    scale: number
  ): string {
    const scaleValue = (value: string): string => {
      // Preserve percentage values as-is (they are relative to the element's own size)
      if (value.endsWith('%')) {
        return value;
      }
      return `${parseFloat(value) * scale}px`;
    };
    return `${scaleValue(borderRadius.topLeft)} ${scaleValue(borderRadius.topRight)} ${scaleValue(borderRadius.bottomRight)} ${scaleValue(borderRadius.bottomLeft)}`;
  }

  /**
   * Scale a transform-origin value by iframe scale factors.
   * Computed transform-origin is always in "Xpx Ypx" format.
   * Pixel values need scaling since the overlay is smaller/larger than the
   * original element; percentage values are preserved as-is.
   *
   * @param transformOrigin - Transform origin string from ElementRect.styles
   * @param scaleX - Horizontal scale factor (typically iframeScale.scaleX)
   * @param scaleY - Vertical scale factor (typically iframeScale.scaleY)
   */
  scaleTransformOrigin(
    transformOrigin: string,
    scaleX: number,
    scaleY: number
  ): string {
    const parts = transformOrigin.split(' ');
    const scaleValue = (value: string, scale: number): string => {
      if (value.endsWith('%')) {
        return value;
      }
      const num = parseFloat(value);
      if (isNaN(num)) {
        // Keyword values (center, top, left, etc.) - preserve as-is
        return value;
      }
      return `${num * scale}px`;
    };
    const x = parts[0] ? scaleValue(parts[0], scaleX) : '0px';
    const y = parts[1] ? scaleValue(parts[1], scaleY) : '0px';
    return `${x} ${y}`;
  }

  /**
   * Transform iframe coordinates to overlay container CSS coordinates.
   * This performs the full multi-stage coordinate transform.
   *
   * @param iframeX - X coordinate in iframe space (bounds.x)
   * @param iframeY - Y coordinate in iframe space (bounds.y)
   * @param context - Scale context (will be computed if not provided)
   */
  transformCoordinates(
    iframeX: number,
    iframeY: number,
    context?: ScaleContext
  ): { left: number; top: number } {
    const ctx = context ?? this.getScaleContext();

    // Coordinate calculation explanation:
    // 1. bounds.x/y are in iframe's internal coordinate system (unscaled)
    // 2. CSS zoom and transform behave differently for margin:
    //    - CSS zoom: scales EVERYTHING including margin
    //    - CSS transform: only scales the border-box (margin is outside)
    // 3. So margin is scaled by: iframeZoom * ancestorScale
    //    And border/padding/content is scaled by: combinedScale (iframeZoom * iframeTransform * ancestorScale)
    // 4. Container's CSS offset is only scaled by ancestorScale
    //
    // marginScale = iframeZoom * ancestorScale (zoom affects margin, transform doesn't)
    const marginScale = {
      x: ctx.iframeZoom.scaleX * ctx.ancestorScale.scaleX,
      y: ctx.iframeZoom.scaleY * ctx.ancestorScale.scaleY,
    };

    // Translate from iframe's CSS transform (e.g., translate(30px, 20px) or
    // the translate component from transform-origin != top left with scale).
    // The translate is in the iframe's own coordinate space and gets scaled
    // by zoom and ancestor scale (but not by transform scale, since it's part
    // of the transform itself).
    const translateRendered = {
      x: ctx.iframeTranslate.left * ctx.iframeZoom.scaleX * ctx.ancestorScale.scaleX,
      y: ctx.iframeTranslate.top * ctx.iframeZoom.scaleY * ctx.ancestorScale.scaleY,
    };

    // Element's rendered position relative to wrapper (in host pixels):
    const elementRenderedPos = {
      x:
        ctx.iframeMargin.left * marginScale.x +
        translateRendered.x +
        (ctx.iframeBorderPadding.left + iframeX) * ctx.combinedScale.scaleX,
      y:
        ctx.iframeMargin.top * marginScale.y +
        translateRendered.y +
        (ctx.iframeBorderPadding.top + iframeY) * ctx.combinedScale.scaleY,
    };

    // Container's rendered offset from wrapper (in host pixels)
    const containerRenderedOffset = {
      x: ctx.containerOffset.left * ctx.ancestorScale.scaleX,
      y: ctx.containerOffset.top * ctx.ancestorScale.scaleY,
    };

    // Overlay's rendered position relative to container (in host pixels)
    const overlayRenderedPos = {
      x: elementRenderedPos.x - containerRenderedOffset.x,
      y: elementRenderedPos.y - containerRenderedOffset.y,
    };

    // Convert to CSS values (divide by ancestorScale since CSS values get scaled)
    return {
      left: overlayRenderedPos.x / ctx.ancestorScale.scaleX,
      top: overlayRenderedPos.y / ctx.ancestorScale.scaleY,
    };
  }

  /**
   * Transform dimensions from iframe space to CSS values for overlay.
   *
   * @param width - Width in iframe space
   * @param height - Height in iframe space
   * @param context - Scale context (will be computed if not provided)
   */
  transformDimensions(
    width: number,
    height: number,
    context?: ScaleContext
  ): { width: number; height: number } {
    const ctx = context ?? this.getScaleContext();

    // Size: element size is scaled by combinedScale, CSS value needs to be divided by ancestorScale
    const renderedWidth = width * ctx.combinedScale.scaleX;
    const renderedHeight = height * ctx.combinedScale.scaleY;

    return {
      width: renderedWidth / ctx.ancestorScale.scaleX,
      height: renderedHeight / ctx.ancestorScale.scaleY,
    };
  }

  // ==================== UTILITY ====================

  /**
   * Update the container reference.
   * Useful when switching overlay containers dynamically.
   */
  setContainer(container: HTMLElement): void {
    this.container = container;
  }

  /**
   * Update the iframe reference.
   */
  setIframe(iframe: HTMLIFrameElement): void {
    this.iframe = iframe;
  }

  /**
   * Get the current iframe element.
   */
  getIframe(): HTMLIFrameElement {
    return this.iframe;
  }

  /**
   * Get the current container element.
   */
  getContainer(): HTMLElement {
    return this.container;
  }
}

export default OverlayPositioner;
