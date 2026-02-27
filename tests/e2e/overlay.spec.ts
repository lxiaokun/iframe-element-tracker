import { test, expect, type Page } from '@playwright/test';

const DEMO_URL = '/demo/host.html';
const TRACKED_ELEMENT_COUNT = 8;
const ALIGNMENT_TOLERANCE = 1; // 1px tolerance for subpixel rounding

test.describe('Overlay E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_URL);
    // Wait for iframe to load and overlays to be created
    await page.waitForFunction(
      (count) => {
        const container = document.getElementById('overlay-container');
        return container && container.children.length >= count;
      },
      TRACKED_ELEMENT_COUNT,
      { timeout: 10000 }
    );
  });

  test('overlay container has overlay elements after page load', async ({ page }) => {
    const overlayCount = await page.locator('#overlay-container > div').count();
    expect(overlayCount).toBe(TRACKED_ELEMENT_COUNT);
  });

  test('overlay count matches tracked element count in iframe', async ({ page }) => {
    const overlayCount = await page.locator('#overlay-container > div').count();
    const iframe = page.frameLocator('#inner-frame');
    const trackedCount = await iframe.locator('.tracked-element').count();
    expect(overlayCount).toBe(trackedCount);
  });

  test('overlays align with iframe elements (no style modifications)', async ({ page }) => {
    await verifyOverlayAlignment(page, ['element-1', 'element-2', 'element-3']);
  });

  test('overlays align after toggling Margin', async ({ page }) => {
    await page.click('#test-margin');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Zoom', async ({ page }) => {
    await page.click('#test-zoom');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Margin + Zoom', async ({ page }) => {
    await page.click('#test-margin');
    await page.click('#test-zoom');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Transform', async ({ page }) => {
    await page.click('#test-transform');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Padding', async ({ page }) => {
    await page.click('#test-padding');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Transform + Zoom', async ({ page }) => {
    await page.click('#test-transform');
    await page.click('#test-zoom');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Padding + Margin', async ({ page }) => {
    await page.click('#test-padding');
    await page.click('#test-margin');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling all four: Margin + Padding + Transform + Zoom', async ({ page }) => {
    await page.click('#test-margin');
    await page.click('#test-padding');
    await page.click('#test-transform');
    await page.click('#test-zoom');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Border', async ({ page }) => {
    await page.click('#test-border');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Scale Up', async ({ page }) => {
    await page.click('#test-scale-up');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Translate', async ({ page }) => {
    await page.click('#test-translate');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Origin Center', async ({ page }) => {
    await page.click('#test-origin-center');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Wrapper Zoom', async ({ page }) => {
    await page.click('#test-wrapper-zoom');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Border + Padding', async ({ page }) => {
    await page.click('#test-border');
    await page.click('#test-padding');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Scale Up + Zoom', async ({ page }) => {
    await page.click('#test-scale-up');
    await page.click('#test-zoom');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Wrapper Zoom + Zoom', async ({ page }) => {
    await page.click('#test-wrapper-zoom');
    await page.click('#test-zoom');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlays align after toggling Translate + Margin', async ({ page }) => {
    await page.click('#test-translate');
    await page.click('#test-margin');
    await waitForOverlayUpdate(page);
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('Reset All restores default state', async ({ page }) => {
    // Apply some styles
    await page.click('#test-margin');
    await page.click('#test-zoom');
    await waitForOverlayUpdate(page);

    // Reset
    await page.click('#test-reset');
    await waitForOverlayUpdate(page);

    // Verify no style buttons are active
    const marginActive = await page.locator('#test-margin').evaluate(
      (el) => el.classList.contains('active')
    );
    expect(marginActive).toBe(false);

    // Verify alignment
    await verifyOverlayAlignment(page, ['element-1', 'element-2']);
  });

  test('overlay mode switches correctly', async ({ page }) => {
    // Switch to Labeled mode
    await page.click('#mode-labeled');
    await page.waitForTimeout(100);

    // Verify overlays have labeled class
    const labeledOverlay = page.locator('#overlay-container .overlay-labeled');
    const count = await labeledOverlay.count();
    expect(count).toBeGreaterThan(0);

    // Verify labels exist
    const labels = page.locator('#overlay-container .overlay-label');
    expect(await labels.count()).toBeGreaterThan(0);
  });

  test('overlays update position after iframe scroll', async ({ page }) => {
    // Get initial position of element-1 overlay
    const initialTop = await getOverlayTop(page, 'element-1');

    // Scroll inside the iframe using window.scrollTo
    const iframePage = page.frameLocator('#inner-frame');
    await iframePage.locator('body').evaluate(() => {
      window.scrollTo(0, 150);
    });

    // Wait for scroll event to fire and update to propagate
    await page.waitForTimeout(300);

    // Overlay position should have changed
    const newTop = await getOverlayTop(page, 'element-1');
    expect(
      Math.abs(newTop - initialTop),
      `Expected overlay top to change after scroll. Initial: ${initialTop}, After: ${newTop}`
    ).toBeGreaterThan(10);
  });
});

// ==================== Helper Functions ====================

/**
 * Wait for overlay positions to update after a style change.
 */
async function waitForOverlayUpdate(page: Page): Promise<void> {
  // Force tracker update and wait for message propagation
  const iframe = page.frameLocator('#inner-frame');
  await iframe.locator('body').evaluate(() => {
    (window as any).tracker?.forceUpdate();
  });
  await page.waitForTimeout(200);
}

/**
 * Wait for element style updates to propagate via postMessage.
 * The host sends ELEMENT_STYLE_CONTROL to iframe, iframe applies styles
 * and calls forceUpdate(), which sends updated rects back to host.
 */
async function waitForElementStyleUpdate(page: Page): Promise<void> {
  await page.waitForTimeout(300);
}

/**
 * Get the top position of an overlay by element id.
 */
async function getOverlayTop(page: Page, elementId: string): Promise<number> {
  return page.locator(`#overlay-container [data-overlay-id="${elementId}"]`).evaluate(
    (el) => parseFloat((el as HTMLElement).style.top)
  );
}

/**
 * Verify that overlays are correctly aligned with their tracked iframe elements.
 *
 * Strategy: Compare the overlay's getBoundingClientRect in the host page with
 * the expected position computed from the iframe's position and the element's
 * position within the iframe (accounting for iframe scale from zoom/transform
 * and ancestor zoom).
 *
 * When iframe has zoom or transform:
 * - iframe.getBoundingClientRect() in host page already reflects the scaled size
 * - iframe.clientLeft/clientTop give the border offset in CSS pixels
 * - Element's position within iframe (elemRect.x/y) must be scaled by the
 *   iframe's zoom * transform * ancestorZoom to get host page pixels
 */
async function verifyOverlayAlignment(
  page: Page,
  elementIds: string[],
  tolerance: number = ALIGNMENT_TOLERANCE
): Promise<void> {
  for (const elementId of elementIds) {
    const positions = await page.evaluate(
      (id) => {
        const iframe = document.getElementById('inner-frame') as HTMLIFrameElement;
        const iframeRect = iframe.getBoundingClientRect();

        // Get iframe scale factors
        const iframeStyle = window.getComputedStyle(iframe);
        const zoomVal = parseFloat(iframeStyle.zoom) || 1;
        let transformScaleX = 1;
        let transformScaleY = 1;
        const transformStr = iframeStyle.transform;
        if (transformStr && transformStr !== 'none') {
          const matrixMatch = transformStr.match(/^matrix\((.+)\)$/);
          if (matrixMatch) {
            const values = matrixMatch[1].split(',').map((v) => parseFloat(v.trim()));
            transformScaleX = values[0];
            transformScaleY = values[3];
          }
        }
        const scaleX = zoomVal * transformScaleX;
        const scaleY = zoomVal * transformScaleY;

        // Get ancestor zoom (walk up from iframe's parent)
        let ancestorZoomX = 1;
        let ancestorZoomY = 1;
        let ancestor: HTMLElement | null = iframe.parentElement;
        while (ancestor && ancestor !== document.body) {
          const aStyle = window.getComputedStyle(ancestor);
          const aZoom = parseFloat(aStyle.zoom) || 1;
          ancestorZoomX *= aZoom;
          ancestorZoomY *= aZoom;
          ancestor = ancestor.parentElement;
        }

        // Get element bounds from within iframe
        const iframeDoc = iframe.contentDocument;
        if (!iframeDoc) return null;
        const element = iframeDoc.getElementById(id);
        if (!element) return null;
        const elemRect = element.getBoundingClientRect();

        const paddingLeft = parseFloat(iframeStyle.paddingLeft) || 0;
        const paddingTop = parseFloat(iframeStyle.paddingTop) || 0;

        // The content area rendered offset from iframeRect edge (in host pixels):
        // clientLeft/clientTop (border) + padding, scaled by iframeScale * ancestorZoom
        const contentOffsetX = (iframe.clientLeft + paddingLeft) * scaleX * ancestorZoomX;
        const contentOffsetY = (iframe.clientTop + paddingTop) * scaleY * ancestorZoomY;

        // Element's rendered position within content area (in host pixels):
        const elemRenderedX = elemRect.x * scaleX * ancestorZoomX;
        const elemRenderedY = elemRect.y * scaleY * ancestorZoomY;

        // Expected overlay position in host viewport:
        const expectedLeft = iframeRect.left + contentOffsetX + elemRenderedX;
        const expectedTop = iframeRect.top + contentOffsetY + elemRenderedY;
        const expectedWidth = elemRect.width * scaleX * ancestorZoomX;
        const expectedHeight = elemRect.height * scaleY * ancestorZoomY;

        // Get overlay bounding rect in host viewport
        const overlay = document.querySelector(
          `[data-overlay-id="${id}"]`
        ) as HTMLElement;
        if (!overlay) return null;
        const overlayRect = overlay.getBoundingClientRect();

        return {
          element: {
            left: expectedLeft,
            top: expectedTop,
            width: expectedWidth,
            height: expectedHeight,
          },
          overlay: {
            left: overlayRect.left,
            top: overlayRect.top,
            width: overlayRect.width,
            height: overlayRect.height,
          },
        };
      },
      elementId
    );

    expect(positions, `Failed to get positions for ${elementId}`).not.toBeNull();
    if (!positions) continue;

    expect(
      Math.abs(positions.element.left - positions.overlay.left),
      `${elementId} left: expected ${positions.element.left}, got ${positions.overlay.left}`
    ).toBeLessThanOrEqual(tolerance);

    expect(
      Math.abs(positions.element.top - positions.overlay.top),
      `${elementId} top: expected ${positions.element.top}, got ${positions.overlay.top}`
    ).toBeLessThanOrEqual(tolerance);

    expect(
      Math.abs(positions.element.width - positions.overlay.width),
      `${elementId} width: expected ${positions.element.width}, got ${positions.overlay.width}`
    ).toBeLessThanOrEqual(tolerance);

    expect(
      Math.abs(positions.element.height - positions.overlay.height),
      `${elementId} height: expected ${positions.element.height}, got ${positions.overlay.height}`
    ).toBeLessThanOrEqual(tolerance);
  }
}

// ==================== Inner Overlay E2E ====================

// ==================== Element Style E2E ====================

test.describe('Element Style E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_URL);
    await page.waitForFunction(
      (count) => {
        const container = document.getElementById('overlay-container');
        return container && container.children.length >= count;
      },
      TRACKED_ELEMENT_COUNT,
      { timeout: 10000 }
    );
  });

  test('overlay aligns after toggling element Margin', async ({ page }) => {
    await page.click('#elem-test-margin');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element Padding', async ({ page }) => {
    await page.click('#elem-test-padding');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element Border', async ({ page }) => {
    await page.click('#elem-test-border');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element Border Radius', async ({ page }) => {
    await page.click('#elem-test-border-radius');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element Box Sizing', async ({ page }) => {
    await page.click('#elem-test-box-sizing');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element Scale', async ({ page }) => {
    await page.click('#elem-test-scale');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element Rotate', async ({ page }) => {
    await page.click('#elem-test-rotate');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element Margin + Padding', async ({ page }) => {
    await page.click('#elem-test-margin');
    await page.click('#elem-test-padding');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element Box Sizing + Padding + Border', async ({ page }) => {
    await page.click('#elem-test-box-sizing');
    await page.click('#elem-test-padding');
    await page.click('#elem-test-border');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element Scale + iframe Zoom', async ({ page }) => {
    await page.click('#elem-test-scale');
    await page.click('#test-zoom');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element Rotate + iframe Transform', async ({ page }) => {
    await page.click('#elem-test-rotate');
    await page.click('#test-transform');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element ::before/::after pseudo', async ({ page }) => {
    await page.click('#elem-test-pseudo');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });

  test('overlay aligns after toggling element ::before/::after pseudo + Margin', async ({ page }) => {
    await page.click('#elem-test-pseudo');
    await page.click('#elem-test-margin');
    await waitForElementStyleUpdate(page);
    await verifyOverlayAlignment(page, ['element-1']);
  });
});

// ==================== Inner Overlay E2E ====================

test.describe('Inner Overlay E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_URL);
    // Wait for iframe to load and host overlays to be created
    await page.waitForFunction(
      (count) => {
        const container = document.getElementById('overlay-container');
        return container && container.children.length >= count;
      },
      TRACKED_ELEMENT_COUNT,
      { timeout: 15000 }
    );
  });

  test('inner overlay appears after enabling labeled mode', async ({ page }) => {
    // Click Inner Overlay "Labeled" button
    await page.click('#inner-mode-labeled');

    // Wait for inner overlays to be created inside iframe
    const iframe = page.frameLocator('#inner-frame');
    await expect(iframe.locator('#overlay-container > div')).toHaveCount(TRACKED_ELEMENT_COUNT, { timeout: 5000 });

    // Verify labeled class is applied (some elements may be offscreen with display:none)
    const labeledCount = await iframe.locator('#overlay-container .overlay-labeled').count();
    expect(labeledCount).toBeGreaterThan(0);

    // Verify labels exist
    const labelCount = await iframe.locator('#overlay-container .overlay-label').count();
    expect(labelCount).toBeGreaterThan(0);
  });

  test('inner overlay is removed after switching to off', async ({ page }) => {
    // Enable inner overlay
    await page.click('#inner-mode-labeled');

    // Wait for inner overlays to appear
    const iframe = page.frameLocator('#inner-frame');
    await expect(iframe.locator('#overlay-container > div')).toHaveCount(TRACKED_ELEMENT_COUNT, { timeout: 5000 });

    // Disable inner overlay
    await page.click('#inner-mode-off');

    // Wait for inner overlays to be removed
    await expect(iframe.locator('#overlay-container > div')).toHaveCount(0, { timeout: 5000 });
  });

  test('host overlay and inner overlay can coexist', async ({ page }) => {
    // Enable inner overlay
    await page.click('#inner-mode-passthrough');

    // Wait for inner overlays to be created
    const iframe = page.frameLocator('#inner-frame');
    await expect(iframe.locator('#overlay-container > div')).toHaveCount(TRACKED_ELEMENT_COUNT, { timeout: 5000 });

    // Verify host overlays still exist
    const hostOverlayCount = await page.locator('#overlay-container > div').count();
    expect(hostOverlayCount).toBe(TRACKED_ELEMENT_COUNT);
  });

  test('inner overlay aligns with iframe elements', async ({ page }) => {
    // Enable inner overlay in passthrough mode
    await page.click('#inner-mode-passthrough');

    // Wait for inner overlays to be created
    const iframe = page.frameLocator('#inner-frame');
    await expect(iframe.locator('#overlay-container > div')).toHaveCount(TRACKED_ELEMENT_COUNT, { timeout: 5000 });

    // Verify alignment for a few elements
    for (const elementId of ['element-1', 'element-2', 'element-3']) {
      const positions = await iframe.locator('body').evaluate((_, id) => {
        const element = document.getElementById(id);
        if (!element) return null;
        const elemRect = element.getBoundingClientRect();

        const overlay = document.querySelector(
          `[data-overlay-id="${id}"]`
        ) as HTMLElement;
        if (!overlay) return null;

        // Overlay uses document coordinates (absolute positioning with scrollY offset)
        const overlayLeft = parseFloat(overlay.style.left);
        const overlayTop = parseFloat(overlay.style.top);
        const overlayWidth = parseFloat(overlay.style.width);
        const overlayHeight = parseFloat(overlay.style.height);

        // Expected document coordinates
        const expectedLeft = elemRect.x + window.scrollX;
        const expectedTop = elemRect.y + window.scrollY;

        return {
          element: {
            left: expectedLeft,
            top: expectedTop,
            width: elemRect.width,
            height: elemRect.height,
          },
          overlay: {
            left: overlayLeft,
            top: overlayTop,
            width: overlayWidth,
            height: overlayHeight,
          },
        };
      }, elementId);

      expect(positions, `Failed to get positions for ${elementId}`).not.toBeNull();
      if (!positions) continue;

      expect(
        Math.abs(positions.element.left - positions.overlay.left),
        `${elementId} left: expected ${positions.element.left}, got ${positions.overlay.left}`
      ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE);

      expect(
        Math.abs(positions.element.top - positions.overlay.top),
        `${elementId} top: expected ${positions.element.top}, got ${positions.overlay.top}`
      ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE);

      expect(
        Math.abs(positions.element.width - positions.overlay.width),
        `${elementId} width: expected ${positions.element.width}, got ${positions.overlay.width}`
      ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE);

      expect(
        Math.abs(positions.element.height - positions.overlay.height),
        `${elementId} height: expected ${positions.element.height}, got ${positions.overlay.height}`
      ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE);
    }
  });
});
