# ElementTracker - Quick Reference Guide

## TL;DR - What It Does

Tracks DOM elements inside iframes and sends their position, size, visibility, and styles to the host page via `postMessage`, enabling overlay annotations that follow tracked elements.

---

## Core Classes

### ElementTracker (iframe side)

```typescript
const tracker = new ElementTracker(options);
tracker.register(element, 'id', { metadata });
tracker.unregister('id');
tracker.destroy();
```

### ElementReceiver (host side)

```typescript
const receiver = new ElementReceiver(iframe);
receiver.on('init', (elements) => {});
receiver.on('update', (elements) => {});
receiver.on('remove', (elements) => {});
const el = receiver.getElement('id');
receiver.destroy();
```

### OverlayPositioner (host side)

```typescript
const positioner = new OverlayPositioner({ iframe, container });
const style = positioner.getOverlayStyle(elementRect);
positioner.applyOverlayStyle(overlayElement, elementRect);
```

---

## What Gets Tracked Per Element

```typescript
ElementRect {
  id: string;                    // Your tracker ID
  timestamp: number;             // Update time

  // DOM metadata
  attributes: {
    elementId: string;           // id attribute
    classList: string[];         // class list
    dataset: Record<string, string>; // data-* attrs
  };

  // Position & size (iframe viewport coords)
  bounds: { x, y, width, height };

  // Visibility info
  visibility: {
    isVisible: boolean;
    isFullyVisible: boolean;
    visibleBounds: { x, y, width, height } | null;
    hiddenReason?: 'offscreen' | 'hidden' | 'collapsed' | 'clipped';
  };

  // CSS properties
  styles: {
    boxSizing, padding, margin, border,
    transform, transformOrigin,
    overflow, clipPath,
    display, opacity, zIndex, pointerEvents, position,
    outline, boxShadow, filter
  };

  // Scroll state (if scrollable)
  scroll?: { top, left, width, height };

  // Your custom data
  metadata?: Record<string, unknown>;
}
```

---

## How It Works

1. **iframe page:** Register elements with tracker
2. **Tracker:** Observes element changes (ResizeObserver, IntersectionObserver, scroll, resize)
3. **Tracker:** Calculates complete element state
4. **Tracker:** Sends `postMessage` to host
5. **Host page:** ElementReceiver receives and validates message
6. **Host page:** Emits events ('init', 'update', 'remove')
7. **Host page:** Application updates overlay positions
8. **OverlayPositioner:** Handles coordinate transformation
9. **Result:** Overlays follow tracked elements! 🎉

---

## Update Triggers

| Trigger            | Throttled? | Response Time |
| ------------------ | ---------- | ------------- |
| Element resize     | Yes (rAF)  | ~16ms         |
| Visibility changes | Yes (rAF)  | ~16ms         |
| Scroll             | No         | <1ms          |
| Window resize      | No         | <1ms          |

---

## Element Bounds with Transforms

**Without transform:**

```
bounds = { x: domRect.x, y: domRect.y, width: domRect.width, height: domRect.height }
```

**With transform:**

1. Parse `matrix(a, b, c, d, e, f)` from `transform` CSS
2. Get original size: `offsetWidth`, `offsetHeight`
3. Transform the 4 corners
4. Find minimum coordinates
5. **Reverse the transform** to get untransformed position

This ensures overlays align correctly even with rotated/scaled elements.

---

## Visibility Determination

```
Is element hidden by CSS?
  YES → 'hidden'
  NO ↓

Is element zero size?
  YES → 'collapsed'
  NO ↓

Is element outside viewport?
  YES → 'offscreen'
  NO ↓

Is element partially clipped by viewport?
  YES → 'clipped' (calculate visibleBounds)
  NO → isFullyVisible = true
```

---

## Message Format

```typescript
interface TrackerMessage {
  type: 'IFRAME_ELEMENT_TRACKER';
  action: 'init' | 'update' | 'remove';
  elements: ElementRect[];
  containerScroll: {
    scrollX: number;
    scrollY: number;
    scrollWidth: number;
    scrollHeight: number;
  };
}
```

---

## Common Usage Patterns

### Pattern 1: Basic Overlay Tracking

```typescript
// iframe page
const tracker = new ElementTracker();
tracker.register(document.getElementById('btn1'), 'btn1');

// host page
const receiver = new ElementReceiver(iframe);
receiver.on('update', (elements) => {
  elements.forEach((el) => updateOverlay(el));
});
```

### Pattern 2: Custom Metadata

```typescript
tracker.register(element, 'id', {
  metadata: { label: 'Primary Button', type: 'button' },
});

receiver.on('update', (elements) => {
  elements.forEach((el) => {
    overlay.title = el.metadata.label;
  });
});
```

### Pattern 3: Selective Tracking

```typescript
receiver.on('update', (elements) => {
  elements.forEach((el) => {
    if (el.visibility.isVisible) {
      overlay.style.display = 'block';
      // Update position
    } else {
      overlay.style.display = 'none';
    }
  });
});
```

### Pattern 4: Same-Page Tracking

```typescript
// No iframe - direct callback mode
const tracker = new ElementTracker({
  onMessage: (message) => {
    receiver.handleTrackerMessage(message);
  },
});
```

---

## Performance Tips

1. **Don't track hundreds of elements** - O(N) per update
2. **Use metadata sparingly** - Adds to serialization size
3. **Batch overlay updates** - Update all overlays in one loop
4. **Consider sampling** - Track every other element if 500+
5. **Use visibility state** - Hide overlays when element not visible

---

## Coordinate Math (For Custom Transforms)

When applying overlay position:

```
1. Get element bounds from tracker (iframe coords)
2. Get iframe's bounding rect in host page
3. Get scale context: iframeScale, ancestorScale, etc.
4. Transform coordinates:
   - Account for iframe margins (scaled by zoom × ancestor)
   - Account for iframe transforms (don't affect margin)
   - Account for border/padding offset
   - Account for overlay container offset
5. Divide by ancestor scale (CSS will scale)
```

The `OverlayPositioner` class handles all this automatically.

---

## Known Limitations

1. **Transforms:** Only `matrix()` fully supported, `matrix3d()` approximated
2. **Occlusion:** Doesn't detect sibling or ancestor occlusion
3. **Scroll:** Only supports single scroll container
4. **Performance:** Scroll events unthrottled (fine for <100 elements)
5. **Browser:** Requires ResizeObserver & IntersectionObserver support

---

## TypeScript Types

```typescript
import type {
  ElementRect,
  ElementVisibility,
  ElementAttributes,
  ElementStyles,
  ElementScroll,
  TrackerMessage,
  ContainerScroll,
  ScaleContext,
  OverlayStyle,
} from 'iframe-element-tracker';
```

---

## Debugging

```typescript
// Check cached elements
const elements = receiver.getElements();
console.log(elements); // Map<id, ElementRect>

// Check single element
const el = receiver.getElement('btn1');
console.log(el.bounds);
console.log(el.visibility);

// Check scroll state
console.log(receiver.getContainerScroll());

// Check iframe position
console.log(receiver.getIframeBounds());

// Listen to all messages
tracker.addMessageListener((msg) => {
  console.log('Message:', msg);
});
```

---

## API Reference

### ElementTracker

| Method                            | Description             |
| --------------------------------- | ----------------------- |
| `register(element, id, options)`  | Start tracking element  |
| `unregister(id)`                  | Stop tracking element   |
| `updateMetadata(id, metadata)`    | Update element metadata |
| `forceUpdate()`                   | Manually trigger update |
| `addMessageListener(callback)`    | Listen to all messages  |
| `removeMessageListener(callback)` | Remove listener         |
| `destroy()`                       | Clean up resources      |

### ElementReceiver

| Method                      | Description                              |
| --------------------------- | ---------------------------------------- |
| `on(event, callback)`       | Listen for 'init', 'update', 'remove'    |
| `off(event, callback)`      | Remove listener                          |
| `getElements()`             | Get all cached elements                  |
| `getElement(id)`            | Get single element                       |
| `getIframe()`               | Get tracked iframe                       |
| `getIframeBounds()`         | Get iframe position in host              |
| `getContainerScroll()`      | Get scroll state                         |
| `handleTrackerMessage(msg)` | Direct message handling (same-page mode) |
| `destroy()`                 | Clean up resources                       |

### OverlayPositioner

| Method                                    | Description                  |
| ----------------------------------------- | ---------------------------- |
| `getOverlayStyle(elementRect)`            | Get CSS values for overlay   |
| `applyOverlayStyle(element, elementRect)` | Apply CSS to element         |
| `getScaleContext()`                       | Get all transform parameters |
| `transformCoordinates(x, y)`              | Transform iframe→host coords |
| `transformDimensions(w, h)`               | Transform sizes              |
| `scaleBorderRadius(radius, scale)`        | Scale border-radius          |
| `scaleTransformOrigin(origin, sx, sy)`    | Scale transform-origin       |

---

## File Structure

```
src/
├── tracker/             # ElementTracker (iframe side)
├── receiver/            # ElementReceiver (host side)
├── overlay-positioner/  # OverlayPositioner (host side)
└── shared/
    ├── types.ts        # All TypeScript definitions
    └── constants.ts    # MESSAGE_TYPE
```

---

## Common Issues

### Overlay doesn't follow element

- ❌ ElementReceiver not listening to 'update' events
- ❌ Element not registered in tracker
- ❌ Overlay CSS position not absolute
- ✅ Verify element.visibility.isVisible

### Transform looks wrong

- ❌ Only `matrix()` transforms fully supported
- ✅ Use `transform: translateX(10px)` not `transform: skew()`

### Message not received

- ❌ Origin mismatch (check allowedOrigin)
- ❌ iframe.contentWindow check failed
- ✅ Check ElementReceiver was created with correct iframe ref

### Performance issues

- ❌ Tracking too many elements (>500)
- ❌ Complex CSS with getComputedStyle() calls
- ✅ Use visibility check to skip hidden elements

---

Generated: April 26, 2026
