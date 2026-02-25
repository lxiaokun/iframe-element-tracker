# iframe-element-tracker

A SDK for tracking DOM elements inside iframes and synchronizing their position, size, and style information to the host page.

[中文文档](./README.zh-CN.md)

## Prerequisites

**Important**: This SDK requires developers to have control over both the host page and the iframe content page (or at least be able to inject code into the iframe page), as ElementTracker and ElementReceiver need to be imported in both pages respectively.

## Why This SDK?

### Simple Registration, Automatic Tracking

Just register the elements you care about, and the SDK automatically tracks all changes:

```typescript
// That's all you need in the iframe
tracker.register(element, 'my-element');
```

No need to manually set up ResizeObserver, IntersectionObserver, scroll listeners, or other complex monitoring logic.

### Comprehensive Change Detection

The SDK automatically monitors and reports:
- Position changes (scroll, layout shifts)
- Size changes (resize, content changes)
- Visibility changes (in/out of viewport, hidden by CSS)
- Style changes (transform, border-radius, opacity, etc.)

### Event-driven API

The host page receives notifications through a clean event interface, making it easy to react to changes:

```typescript
receiver.on('update', (elements) => {
  // React to element changes
});
```

### Decoupled Architecture

Host and iframe pages communicate only through events and data via postMessage, keeping codebases independent and maintainable.

### Overlay Beyond Boundaries

When you need to annotate iframe elements, annotations rendered inside the iframe cannot extend beyond its boundaries. By tracking elements and rendering overlays in the host page, labels, toolbars, and other UI elements can freely extend outside the iframe rect.

## Features

- **Real-time Tracking**: Track element position, size, and style changes in real-time
- **Cross-iframe Communication**: Seamless communication between iframe and host page via postMessage
- **Rich Element Information**: Comprehensive data including bounds, visibility, CSS styles, transforms, and more
- **Framework Agnostic**: Pure data layer SDK, no UI framework dependency
- **High Performance**: Optimized with ResizeObserver, IntersectionObserver, and efficient update batching
- **TypeScript Support**: Full type definitions included

## Installation

```bash
npm install iframe-element-tracker
```

## Quick Start

### Inside the iframe (ElementTracker)

```typescript
import { ElementTracker } from 'iframe-element-tracker';

const tracker = new ElementTracker();

// Register elements to track
tracker.register(document.getElementById('my-element'), 'my-element', {
  metadata: { label: 'My Element' }
});

// Unregister when done
tracker.unregister('my-element');

// Clean up
tracker.destroy();
```

### In the host page (ElementReceiver)

```typescript
import { ElementReceiver } from 'iframe-element-tracker';

const iframe = document.getElementById('my-iframe') as HTMLIFrameElement;
const receiver = new ElementReceiver(iframe);

// Listen for element initialization
receiver.on('init', (elements) => {
  elements.forEach(el => {
    console.log(`Element ${el.id} initialized at (${el.bounds.x}, ${el.bounds.y})`);
  });
});

// Listen for element updates
receiver.on('update', (elements) => {
  elements.forEach(el => {
    console.log(`Element ${el.id} moved to (${el.bounds.x}, ${el.bounds.y})`);
  });
});

// Listen for element removal
receiver.on('remove', (elements) => {
  elements.forEach(el => {
    console.log(`Element ${el.id} removed`);
  });
});

// Get current element data
const allElements = receiver.getElements();
const singleElement = receiver.getElement('my-element');

// Clean up
receiver.destroy();
```

### Rendering Overlays (OverlayPositioner)

When rendering overlays on the host page, you need to convert iframe coordinates to host page coordinates. The `OverlayPositioner` handles all the complex coordinate transformations automatically, including:

- iframe margin, border, and padding
- CSS `transform: scale()` on iframe or ancestors
- CSS `zoom` on iframe or ancestors
- Overlay container offset (when container extends beyond iframe)

```typescript
import { ElementReceiver, OverlayPositioner } from 'iframe-element-tracker';

const iframe = document.getElementById('my-iframe') as HTMLIFrameElement;
const overlayContainer = document.getElementById('overlay-container');

const receiver = new ElementReceiver(iframe);
const positioner = new OverlayPositioner({ iframe, container: overlayContainer });

// Simple usage: apply style directly to overlay element
receiver.on('update', (elements) => {
  elements.forEach(el => {
    const overlay = getOrCreateOverlay(el.id);
    positioner.applyOverlayStyle(overlay, el);
  });
});

// Or get style values to apply manually
receiver.on('update', (elements) => {
  elements.forEach(el => {
    const style = positioner.getOverlayStyle(el);
    if (style) {
      overlay.style.left = `${style.left}px`;
      overlay.style.top = `${style.top}px`;
      overlay.style.width = `${style.width}px`;
      overlay.style.height = `${style.height}px`;
      overlay.style.borderRadius = style.borderRadius;
    }
  });
});
```

#### Advanced: Low-level API

For custom calculations or optimization, you can access the low-level methods:

```typescript
// Get all scale and offset values
const context = positioner.getScaleContext();
// Returns: { iframeScale, iframeZoom, iframeTransform, ancestorScale,
//            combinedScale, iframeMargin, iframeBorderPadding, containerOffset }

// Transform coordinates manually
const position = positioner.transformCoordinates(bounds.x, bounds.y, context);

// Transform dimensions manually
const dimensions = positioner.transformDimensions(bounds.width, bounds.height, context);

// Scale border-radius
const borderRadius = positioner.scaleBorderRadius(styles.border.radius, context.iframeScale.scaleX);
```

## API Reference

### ElementTracker

The ElementTracker runs inside the iframe and tracks registered DOM elements.

#### Constructor

```typescript
new ElementTracker(options?: TrackerOptions)
```

**Options:**
- `targetWindow?: Window` - Target window for postMessage (default: `window.parent`)
- `targetOrigin?: string` - Target origin for postMessage (default: `'*'`)

#### Methods

| Method | Description |
|--------|-------------|
| `register(element, id, options?)` | Register an element for tracking |
| `unregister(id)` | Stop tracking an element |
| `updateMetadata(id, metadata)` | Update element's metadata |
| `forceUpdate()` | Manually trigger an update |
| `destroy()` | Clean up all resources |

### ElementReceiver

The ElementReceiver runs in the host page and receives element data from the iframe.

#### Constructor

```typescript
new ElementReceiver(iframe: HTMLIFrameElement, options?: ReceiverOptions)
```

**Options:**
- `allowedOrigin?: string` - Allowed origin for messages (default: `'*'`)

#### Methods

| Method | Description |
|--------|-------------|
| `on(event, callback)` | Listen for events ('init', 'update', 'remove') |
| `off(event, callback)` | Remove event listener |
| `getElements()` | Get all tracked elements |
| `getElement(id)` | Get a single element by ID |
| `getIframe()` | Get the bound iframe element |
| `getIframeBounds()` | Get iframe's bounding rect |
| `destroy()` | Clean up all resources |

### OverlayPositioner

Handles coordinate transformation for overlay positioning. Automatically accounts for iframe's margin, border, padding, transform, zoom, and overlay container offset.

#### Constructor

```typescript
new OverlayPositioner(options: OverlayPositionerOptions)
```

**Options:**
- `iframe: HTMLIFrameElement` - The iframe element
- `container: HTMLElement` - The overlay container element

#### Methods

| Method | Description |
|--------|-------------|
| `applyOverlayStyle(overlay, elementRect)` | Apply calculated style directly to overlay element |
| `getOverlayStyle(elementRect)` | Get calculated style values (returns `OverlayStyle \| null`) |
| `getScaleContext()` | Get all scale and offset values for custom calculations |
| `transformCoordinates(x, y, context?)` | Transform iframe coordinates to CSS left/top |
| `transformDimensions(width, height, context?)` | Transform dimensions to CSS width/height |
| `scaleBorderRadius(radius, scale)` | Scale border-radius values |
| `getIframeScale()` | Get iframe's combined transform/zoom scale |
| `getIframeScaleSeparate()` | Get iframe's zoom and transform scales separately |
| `getAncestorScale()` | Get cumulative scale from ancestor elements |

### ElementRect

The data structure for tracked elements:

```typescript
interface ElementRect {
  id: string;                    // Unique tracker identifier
  timestamp: number;             // Last update timestamp

  attributes: {
    elementId: string;           // Element's id attribute
    classList: string[];         // Element's class list
    dataset: Record<string, string>; // Element's data-* attributes
  };

  bounds: {
    x: number;                   // X position relative to iframe viewport
    y: number;                   // Y position relative to iframe viewport
    width: number;               // Element width
    height: number;              // Element height
  };

  visibility: {
    isVisible: boolean;          // Whether element is visible in viewport
    isFullyVisible: boolean;     // Whether element is fully visible
    visibleBounds: {...} | null; // Visible portion bounds
    hiddenReason?: string;       // Reason if hidden
  };

  styles: {
    boxSizing: string;
    padding: Spacing;
    margin: Spacing;
    border: {...};
    transform: string | null;
    transformOrigin: string;
    overflow: { x: string; y: string };
    opacity: number;
    // ... more CSS properties
  };

  scroll?: {...};                // Scroll state if scrollable
  metadata?: Record<string, any>; // Custom user data
}
```

## Use Cases

- **Overlay Annotations**: Render highlights, labels, or toolbars over iframe elements
- **Visual Testing**: Track element positions for visual regression testing
- **Analytics**: Monitor user interactions with specific elements
- **Accessibility Tools**: Build accessibility overlays and helpers
- **Design Tools**: Create visual editors that work across iframe boundaries

## Testing

The project includes unit tests (Vitest) and E2E tests (Playwright).

```bash
# Run unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run unit tests with coverage report
npm run test:coverage

# Run E2E tests (requires dev server running or auto-starts it)
npm run test:e2e
```

### Unit Tests

Unit tests cover the three core modules:

- **OverlayPositioner** (`tests/unit/overlay-positioner.test.ts`) — Coordinate transformation math, dimension scaling, border-radius scaling, CSS zoom/transform parsing, ancestor scale accumulation
- **ElementReceiver** (`tests/unit/receiver.test.ts`) — Message handling, origin validation, state management, event system, lifecycle
- **ElementTracker** (`tests/unit/tracker.test.ts`) — Element registration, data collection, message format, lifecycle

### E2E Tests

E2E tests (`tests/e2e/overlay.spec.ts`) verify the full tracking and overlay rendering pipeline in a real browser:

- Overlay creation and count
- Overlay alignment under various iframe styles (Margin, Zoom, Transform, combinations)
- Overlay mode switching
- Scroll tracking

## Demo

Run the demo to see the SDK in action:

```bash
npm install
npm run dev
```

Then open http://localhost:3000/demo/host.html

## Browser Support

- Chrome 64+
- Firefox 69+
- Safari 14+
- Edge 79+

## License

MIT
