# iframe-element-tracker Codebase Analysis

SDK for tracking DOM elements inside iframes and rendering overlays in the host page with sub-pixel accuracy, handling CSS transforms, zoom levels, and viewport changes. Overlays can exceed iframe boundaries.

---

## 1. ElementTracker (iframe side)

**Location:** `src/tracker/index.ts`

### Multi-Layer Observer Pattern

ElementTracker uses 4 complementary observation mechanisms:

| Observer             | Purpose            | Throttled | Notes                            |
| -------------------- | ------------------ | --------- | -------------------------------- |
| ResizeObserver       | Size changes       | Yes (rAF) | Auto-unobserved on unregister    |
| IntersectionObserver | Visibility changes | Yes (rAF) | 11 thresholds: [0, 0.1...1.0]    |
| Scroll listener      | Viewport offset    | **No**    | `passive: true`, `capture: true` |
| Resize listener      | Viewport size      | **No**    | Immediate for smooth UX          |

### Update Scheduling

```typescript
// ResizeObserver & IntersectionObserver -> Throttled via rAF
scheduleUpdate() {
  if (this.pendingUpdate !== null) return;  // Already scheduled
  this.pendingUpdate = requestAnimationFrame(() => {
    this.pendingUpdate = null;
    this.performUpdate();
  });
}

// Scroll & Resize events -> Synchronous (NO throttling)
performUpdate();  // Called immediately for responsiveness
```

**Design rationale:** Observers fire frequently so batching reduces message overhead. Scroll/resize need real-time response for smooth overlay following.

### Bounds Calculation

**Simple case (no transform):** Uses `getBoundingClientRect()` directly.

**With CSS transform:**

1. Parse `matrix(a, b, c, d, e, f)` from `getComputedStyle()` - extract scale (`a`, `d`) and translate (`e`, `f`)
2. Get transform-origin point (e.g., `"50px 50px"`)
3. Get original dimensions via `offsetWidth`/`offsetHeight` (untransformed)
4. Transform 4 corners: `tx = ox + a*(px-ox) + c*(py-oy) + e`
5. Reverse-calculate untransformed position from min corner offsets

**Why:** `getBoundingClientRect()` returns AABB (axis-aligned bounding box) which is larger than the actual element when rotated. We need original bounds for correct overlay sizing.

**Fallback for matrix3d:** Center-based approximation (position from AABB center, keep original dims).

### Visibility Tracking Logic

```typescript
// 1. CSS hidden
if (display === 'none' || visibility === 'hidden') -> 'hidden'

// 2. Zero size
if (width === 0 || height === 0) -> 'collapsed'

// 3. Viewport intersection
visibleX = max(0, elemX)
visibleRight = min(viewportWidth, elemX + elemWidth)
visibleWidth = max(0, visibleRight - visibleX)

// 4. Completely off-screen
if (visibleWidth === 0 || visibleHeight === 0) -> 'offscreen'

// 5. Partially vs fully visible
if (fully within viewport) -> isFullyVisible = true
else -> hiddenReason = 'clipped', calculate visibleBounds
```

**NOT tracked:** Sibling occlusion (z-index), ancestor overflow occlusion, Shadow DOM - would require hit-testing with significant performance cost.

### Message Protocol

```typescript
interface TrackerMessage {
  type: 'IFRAME_ELEMENT_TRACKER'; // Constant for filtering
  action: 'init' | 'update' | 'remove';
  elements: ElementRect[];
  containerScroll?: ContainerScroll;
}

interface ContainerScroll {
  scrollX: number;
  scrollY: number;
  scrollWidth: number;
  scrollHeight: number;
}
```

**Two sending modes:**

1. **postMessage** (cross-iframe): `this.targetWindow.postMessage(message, this.targetOrigin)`
2. **Direct callback** (same-page): `this.onMessage(message)` - no serialization overhead

Additional listeners receive messages after primary dispatch for monitoring/debugging.

### Performance

```
Space: O(n) - trackedElements Map + observer entries
Time per update cycle: O(n)
  - getElementRect(): O(1) per element (getComputedStyle, getBoundingClientRect, matrix parse)
Memory per element: ~1-2KB (ElementRect object)
```

---

## 2. ElementReceiver (host side)

**Location:** `src/receiver/index.ts`

### Class Structure

```typescript
class ElementReceiver {
  private iframe: HTMLIFrameElement | null;
  private allowedOrigin: string; // Default '*'
  private elements: Map<string, ElementRect> = new Map();
  private listeners: Map<MessageAction, Set<EventCallback>> = new Map();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private isDestroyed = false;
  private containerScroll: ContainerScroll | undefined;
}
```

### Message Reception & Validation

**Mode 1: postMessage (cross-origin)**

```typescript
private handleMessage(event: MessageEvent): void {
  if (this.isDestroyed) return;
  if (this.allowedOrigin !== '*' && event.origin !== this.allowedOrigin) return;
  if (!this.iframe || event.source !== this.iframe.contentWindow) return;
  if (!message || message.type !== MESSAGE_TYPE) return;

  this.containerScroll = message.containerScroll;
  switch (message.action) {
    case 'init': this.handleInit(message.elements); break;
    case 'update': this.handleUpdate(message.elements); break;
    case 'remove': this.handleRemove(message.elements); break;
  }
}
```

**Mode 2: Direct (same-page)** - `handleTrackerMessage(message)` skips origin/source validation.

### Action Handlers

| Action   | Behavior                    | Event Condition               |
| -------- | --------------------------- | ----------------------------- |
| `init`   | Stores elements in Map      | Always emits                  |
| `update` | Overwrites existing entries | Always emits                  |
| `remove` | Deletes from Map            | Only emits if element existed |

### Event System

```typescript
on(event: MessageAction, callback: EventCallback): void   // Add listener (Set-based, no duplicates)
off(event: MessageAction, callback: EventCallback): void  // Remove listener
private emit(event: MessageAction, elements: ElementRect[]): void  // Error-isolated dispatch
```

- Multiple listeners per event, stored in Sets
- Errors in one listener don't affect others (try/catch wrapper)
- `destroy()` removes message listener, clears elements Map and listeners

### State Queries

```typescript
getElements(): Map<string, ElementRect>      // Returns copy (not reference)
getElement(id: string): ElementRect | undefined
getIframe(): HTMLIFrameElement | null
getIframeBounds(): DOMRect | null
getContainerScroll(): ContainerScroll | undefined
```

### Performance

```
Space: O(n) elements + O(m) listeners
Time per message: O(1) validation + O(n) element processing
Event emission: O(m) per event type
```

---

## 3. OverlayPositioner (host side)

**Location:** `src/overlay-positioner/index.ts`

Transforms iframe-space coordinates to host CSS coordinates, accounting for iframe zoom, transform, margin, border, padding, ancestor transforms, and overlay container offset.

### ScaleContext

```typescript
interface ScaleContext {
  iframeScale: Scale2D; // zoom * transform (combined)
  iframeZoom: Scale2D; // CSS zoom only
  iframeTransform: Scale2D; // CSS transform scale only
  iframeTranslate: Offset2D; // Transform translate + origin offset
  ancestorScale: Scale2D; // Accumulated parent zoom/transform
  combinedScale: Scale2D; // iframeScale * ancestorScale
  iframeMargin: Offset2D; // iframe margin (outside)
  iframeBorderPadding: Offset2D; // iframe border + padding (inside)
  containerOffset: Offset2D; // overlay container CSS left/top
}
```

### Critical Insight: CSS Zoom vs Transform

| Property        | Scales                      | Effect on margin |
| --------------- | --------------------------- | ---------------- |
| CSS `zoom`      | Everything including margin | Yes              |
| CSS `transform` | Only border-box content     | No               |

**Scaling formulas:**

- Margin scaled by: `iframeZoom * ancestorScale`
- Content scaled by: `combinedScale = iframeZoom * iframeTransform * ancestorScale`
- CSS output divided by: `ancestorScale` (because ancestor scale affects CSS rendering)

### transformCoordinates() - Core Algorithm

```typescript
transformCoordinates(iframeX: number, iframeY: number, context?: ScaleContext): { left, top } {
  const ctx = context ?? this.getScaleContext();

  // Stage 1: Margin scaling (NOT by iframeTransform)
  const marginScale = { x: ctx.iframeZoom.scaleX * ctx.ancestorScale.scaleX, ... };

  // Stage 2: Translate rendered in host pixels
  const translateRendered = {
    x: ctx.iframeTranslate.left * ctx.iframeZoom.scaleX * ctx.ancestorScale.scaleX, ...
  };

  // Stage 3: Element rendered position
  const elementRenderedPos = {
    x: ctx.iframeMargin.left * marginScale.x
       + translateRendered.x
       + (ctx.iframeBorderPadding.left + iframeX) * ctx.combinedScale.scaleX, ...
  };

  // Stage 4: Subtract container offset (scaled by ancestorScale)
  const overlayRenderedPos = {
    x: elementRenderedPos.x - ctx.containerOffset.left * ctx.ancestorScale.scaleX, ...
  };

  // Stage 5: Convert to CSS values
  return { left: overlayRenderedPos.x / ctx.ancestorScale.scaleX, ... };
}
```

### transformDimensions()

```typescript
transformDimensions(width, height, context?): { width, height } {
  // Size scaled by combinedScale, then divided by ancestorScale for CSS output
  return {
    width: width * ctx.combinedScale.scaleX / ctx.ancestorScale.scaleX,
    height: height * ctx.combinedScale.scaleY / ctx.ancestorScale.scaleY,
  };
}
```

### getIframeScaleSeparate()

Parses iframe's computed style to separate zoom and transform:

- Extracts CSS `zoom` value
- Parses `matrix(a, b, c, d, e, f)` for scale (`a`, `d`) and translate (`e`, `f`)
- Computes transform-origin offset: `(1 - scaleValue) * originValue`

### getAncestorScale()

Walks from container parent up to `document.body`, accumulating zoom and transform scale factors.

### scaleBorderRadius()

- Pixel values scaled by scale factor
- **Percentage values preserved as-is** (relative to element's own size)

### scaleTransformOrigin()

- Pixel values scaled by scaleX/scaleY
- Percentages and keywords (center, top, etc.) preserved as-is

### High-Level API

```typescript
getOverlayStyle(elementRect): OverlayStyle | null  // Returns null for invisible elements
applyOverlayStyle(overlay: HTMLElement, elementRect): void  // Sets display:none if invisible
```

### Performance

```
Space: O(1) - only iframe/container references
getScaleContext(): O(d) where d = DOM depth to body
transformCoordinates/Dimensions: O(1) math
Optimization: Call getScaleContext() once per batch, reuse across elements
```

---

## 4. Data Flow

### Complete Communication Cycle

```
IFRAME (ElementTracker)                          HOST PAGE
|                                                |
+- register(element, id, options)                |
+- Observers activated                           |
+- getElementRect() collects state               |
+- Send 'init' TrackerMessage --- postMessage -->+- Validate origin/source/type
|                                                +- Store in elements Map
|                                                +- emit('init', elements)
|                                                +- Listeners create overlays
|                                                |
+- Element changes (size/position/style)         |
+- Observer fires -> scheduleUpdate/performUpdate|
+- Collect all element rects                     |
+- Send 'update' TrackerMessage --- postMessage >+- Update elements Map
|                                                +- emit('update', elements)
|                                                +- positioner.applyOverlayStyle()
|                                                |
+- unregister(id)                                |
+- Cleanup observers                             |
+- Send 'remove' TrackerMessage --- postMessage >+- Delete from Map
|                                                +- emit('remove', removed)
|                                                +- overlay.remove()
```

### State Consistency Guarantees

- All elements in a message processed atomically (Map updated before events emitted)
- postMessage guarantees order within same sender
- Updates supersede previous (no rollback)
- If listener throws, others still receive the event

### Error Handling

All dispatch points (tracker `onMessage`, tracker `messageListeners`, receiver `emit`) wrap callbacks in try/catch - errors logged to console, execution continues.

---

## 5. ElementRect Data Structure

```typescript
interface ElementRect {
  id: string;
  timestamp: number;

  attributes: {
    elementId: string;
    classList: string[];
    dataset: Record<string, string>;
  };

  bounds: {
    // Viewport-relative (from getBoundingClientRect)
    x: number;
    y: number;
    width: number;
    height: number; // offsetWidth/offsetHeight when transformed
  };

  visibility: {
    isVisible: boolean;
    isFullyVisible: boolean;
    visibleBounds: Bounds | null; // Clipped visible area
    hiddenReason?: 'offscreen' | 'hidden' | 'collapsed' | 'clipped';
  };

  styles: {
    boxSizing: 'content-box' | 'border-box';
    padding: Spacing; // { top, right, bottom, left }
    margin: Spacing;
    border: {
      width: Spacing;
      radius: { topLeft; topRight; bottomRight; bottomLeft }; // String "Npx" or "N%"
    };
    transform: string | null; // Computed matrix or null
    transformOrigin: string;
    overflow: { x: string; y: string };
    clipPath: string | null;
    display: string;
    opacity: number;
    zIndex: string;
    pointerEvents: string;
    position: string;
    outline?: { width: number; offset: number };
    boxShadow?: string;
    filter?: string;
  };

  scroll?: { top: number; left: number; width: number; height: number };
  metadata?: Record<string, unknown>;
}
```

---

## 6. Demo Implementation

### Host Page (`demo/host.html` + `demo/host.ts`)

**Layout:**

```
.iframe-wrapper (position: relative, 500px h)
  +-- <iframe id="inner-frame">
  +-- .overlay-clip (position: absolute, top:-50px, left:-50px, overflow:hidden, 100px padding)
        +-- #overlay-container (position: absolute, pointer-events: none)
```

The overlay-clip's overflow:hidden with 50px negative offset + 100px padding creates a boundary allowing overlays to exceed iframe bounds by ~50px on all sides.

### Overlay Modes

| Mode            | Visuals                                    | Pointer Events | Overflow               |
| --------------- | ------------------------------------------ | -------------- | ---------------------- |
| **Passthrough** | 2px dashed green                           | none           | No                     |
| **Interactive** | 2px solid blue, hover effects              | auto           | No                     |
| **Labeled**     | 2px solid purple + label at top:-28px      | label: auto    | Label exceeds top      |
| **Rich**        | 2px solid yellow + toolbar at bottom:-36px | toolbar: auto  | Toolbar exceeds bottom |

### Scroll Optimization

```typescript
if (scrollChanged) {
  // Only toggle visibility, skip coordinate recalculation
  elements.forEach((el) => {
    overlay.style.display = el.visibility.isVisible ? 'block' : 'none';
  });
} else {
  // Full update with coordinate transforms
  positioner.applyOverlayStyle(overlay, docRect);
}
```

### Inner Page (`demo/inner.html` + `demo/inner.ts`)

8 tracked elements with varied shapes (circle, rotated, asymmetric border-radius) and edge positions for boundary testing.

**Same-page overlay mode:**

```typescript
localReceiver = new ElementReceiver(null);
unsubscribeListener = tracker.addMessageListener((msg) => localReceiver.handleTrackerMessage(msg));
```

### Control Flow

1. **Init:** iframe loads -> ElementReceiver + OverlayPositioner created -> subscribe to events -> create overlays on 'init'
2. **Scroll:** iframe scrolls -> Tracker sends update (sync) -> Host detects scroll-only -> toggle visibility
3. **Style change:** Host sends `ELEMENT_STYLE_CONTROL` to iframe -> inner page applies style -> ResizeObserver detects -> Tracker sends update -> Host recalculates

---

## 7. Testing

### Test Helpers

```typescript
// tests/helpers/fixtures.ts
createElementRect(overrides); // Factory with sensible defaults, partial overrides
createScaleContext(overrides); // Identity context by default

// tests/helpers/dom-mocks.ts
MockResizeObserver; // triggerResize(entries)
MockIntersectionObserver; // triggerIntersection(entries)
createMockIframe(computedStyle); // iframe with mocked contentWindow
createMockComputedStyle(overrides);
installObserverMocks(); // vi.stubGlobal for both observers
```

### Unit Test Coverage (80+ tests)

**ElementTracker:** Register/unregister (9), data collection (5), message sending (5), lifecycle (4), callbacks (10)

**ElementReceiver:** Message handling (7), state management (4), event system (4), lifecycle (3), same-page mode (7)

**OverlayPositioner:** transformCoordinates (7), transformDimensions (3), scaleBorderRadius (5), getOverlayStyle/applyOverlayStyle (5), getIframeScaleSeparate (4), getAncestorScale (2)

### E2E Tests (Playwright, 1px tolerance)

- Overlay alignment with transform combinations (margin, zoom, padding, scale, border, and all combinations)
- Scroll handling (hide on scroll out, show on scroll back)
- Mode switching (all 4 modes render correctly)
- Element style mutations

### Key Test Patterns

```typescript
// Observer mocking
beforeEach(() => {
  installObserverMocks();
});

// Event simulation
dispatchMessage(createTrackerMessage('init', [createElementRect()]));
expect(callback).toHaveBeenCalledWith(elements);

// Scale context math verification
const result = positioner.transformCoordinates(100, 50, scaleContext);
// Verify: (margin*marginScale + content) * combinedScale / ancestorScale
```

---

## 8. Public API

```typescript
export { ElementTracker };       // iframe side
export { ElementReceiver };      // host side
export { OverlayPositioner };    // host side
export { MESSAGE_TYPE };         // 'IFRAME_ELEMENT_TRACKER'
export type { ElementRect, ElementVisibility, ElementStyles, ScaleContext, ... };
```

### Usage: Cross-iframe

```typescript
// Host
const receiver = new ElementReceiver(iframe, { allowedOrigin: 'https://example.com' });
const positioner = new OverlayPositioner({ iframe, container: overlayContainer });

receiver.on('init', (elements) => {
  /* create overlays */
});
receiver.on('update', (elements) => {
  elements.forEach((el) => positioner.applyOverlayStyle(overlay, el));
});
receiver.on('remove', (elements) => {
  /* remove overlays */
});

// Iframe
const tracker = new ElementTracker();
tracker.register(element, 'id', { metadata: { label: 'My Element' } });
```

### Usage: Same-page

```typescript
const tracker = new ElementTracker();
const receiver = new ElementReceiver(null);
tracker.addMessageListener((msg) => receiver.handleTrackerMessage(msg));
receiver.on('update', (elements) => {
  /* handle */
});
```

---

## 9. Coordinate Systems

| System   | Origin                     | Used By                                       |
| -------- | -------------------------- | --------------------------------------------- |
| Viewport | iframe viewport top-left   | `getBoundingClientRect()`, ElementRect.bounds |
| Document | iframe document top-left   | Overlay positioning with scroll compensation  |
| CSS      | overlay container top-left | OverlayPositioner output values               |

**Conversion:** Viewport -> Document (add scroll) -> CSS (apply ScaleContext transforms)
