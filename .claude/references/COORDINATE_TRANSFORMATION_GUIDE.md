# Coordinate Transformation Deep Dive

## The Problem

When an iframe element needs to be overlaid with a tracking overlay in the host page, several complications arise:

1. **Iframe transforms**: The iframe might have `scale()`, `translate()`, or other transforms
2. **Iframe zoom**: The iframe might have CSS `zoom: 0.8` applied
3. **Iframe spacing**: The iframe might have margin, border, or padding
4. **Container positioning**: The overlay container itself might be offset with CSS `left`/`top`
5. **Ancestor transforms**: Parent elements of the iframe might have their own transforms/zoom
6. **Box model differences**: CSS zoom affects margin differently than transform does

## Box Model Scaling Differences

This is **critical** to understand:

### CSS Zoom

```
┌─────────────────────────────┐
│         Margin (SCALED)     │  zoom affects this
├─────────────────────────────┤
│         Border + Padding    │  zoom affects this
├─────────────────────────────┤
│         Content             │  zoom affects this
└─────────────────────────────┘
```

**CSS Zoom scales the ENTIRE box model, including margin**

### CSS Transform

```
┌─────────────────────────────┐
│         Margin (NOT scaled) │  transform does NOT affect this
├─────────────────────────────┤
│    ┌─────────────────────┐  │  transform affects this
│    │   Border + Padding  │  │
│    ├─────────────────────┤  │
│    │     Content         │  │
│    └─────────────────────┘  │
└─────────────────────────────┘
```

**CSS Transform only scales the border-box, not the margin**

## Scaling Factors Breakdown

### 1. Margin Scale

- **Formula**: `marginScale = iframeZoom × ancestorScale`
- **Why**: Margin is outside the iframe, only affected by zoom (not transform)
- **Calculation**: `margin * marginScale`

### 2. Content Scale (Border + Padding + Element)

- **Formula**: `contentScale = iframeZoom × iframeTransform × ancestorScale` (combinedScale)
- **Why**: Content is inside iframe, affected by zoom AND transform
- **Calculation**: `(borderPadding + elementPosition) * contentScale`

### 3. Container Scale

- **Formula**: `containerScale = ancestorScale`
- **Why**: Container is at host level, only affected by ancestors (not iframe transform)
- **Calculation**: `containerOffset * containerScale`

## Transform Matrix Components

When an iframe has `transform: scale(0.8) translateX(10px)`, the computed style returns:

```
transform: matrix(a, b, c, d, e, f)
         = matrix(scaleX, skewY, skewX, scaleY, translateX, translateY)
```

### Matrix Values

- `a (values[0])` = horizontal scale
- `d (values[3])` = vertical scale
- `e (values[4])` = horizontal translate
- `f (values[5])` = vertical translate

## Transform-Origin Offset

When scaling with a non-default origin:

```
Original element at (0, 0) with origin at (100, 100)
After scale(0.8) from (100, 100):

  1. Move to origin: (0, 0) → (0, 100)
  2. Scale: (0, 100) → scale by 0.8
  3. Move back: result includes offset

Visual offset = (1 - scaleValue) × originValue
              = (1 - 0.8) × 100
              = 20 pixels
```

This offset is **not in the matrix** - the browser computes it internally, so we must extract it manually.

## The Full Transformation Formula

### Input

- `iframeX, iframeY` = Element position in iframe's coordinate space
- `width, height` = Element size in iframe space

### Step 1: Separate Zoom and Transform

```typescript
const zoom = parseFloat(style.zoom); // e.g., 0.8
const transform = matrix(a, d, e, f); // e.g., scale(0.8)
const originOffset = (1 - scale) * origin; // Additional offset from origin
```

### Step 2: Calculate Margin Impact

```typescript
const marginScale = zoom × ancestorScale;
const renderedMargin = margin × marginScale;
```

### Step 3: Calculate Transform Translate

```typescript
const translateRendered = (matrixTranslate + originOffset) × zoom × ancestorScale;
```

### Step 4: Calculate Element Position (in host pixels)

```typescript
const elementRenderedX =
    renderedMargin.left +
    translateRendered.x +
    (borderPadding.left + iframeX) × combinedScale.x;

const elementRenderedY =
    renderedMargin.top +
    translateRendered.y +
    (borderPadding.top + iframeY) × combinedScale.y;
```

### Step 5: Subtract Container Offset

```typescript
const overlayRenderedX = elementRenderedX - (containerOffset.left × ancestorScale.x);
const overlayRenderedY = elementRenderedY - (containerOffset.top × ancestorScale.y);
```

### Step 6: Convert to CSS Values

CSS values are rendered at host pixel scale, but get scaled by ancestorScale. To get the CSS value, divide back:

```typescript
const cssLeft = overlayRenderedX / ancestorScale.x;
const cssTop = overlayRenderedY / ancestorScale.y;
```

## Real Example

### Setup

```
Host page has:
- iframe with style: margin: 10px; border: 2px; padding: 5px; transform: scale(0.8); zoom: 0.9;
- iframe ancestor div with zoom: 1.1
- overlay container with style: left: 20px; top: 30px;

Iframe contains:
- element at (100, 100) with size (50, 50)
```

### Calculation

```typescript
// Step 1: Parse iframe scales
zoom = 0.9
transform.scaleX = 0.8
originOffset = 0
marginScale = 0.9 × 1.1 = 0.99
combinedScale = 0.9 × 0.8 × 1.1 = 0.792

// Step 2: Calculate positions (in host pixels)
margin.left = 10 × 0.99 = 9.9px
borderPadding.left = 7px (2px border + 5px padding)
elementContent.left = 100px

elementRenderedX = 9.9 + 0 + (7 + 100) × 0.792 = 9.9 + 84.864 = 94.764px
containerOffset.left = 20 × 1.1 = 22px
overlayRenderedX = 94.764 - 22 = 72.764px

// Step 3: Convert to CSS
cssLeft = 72.764 / 1.1 = 66.149px

// Similarly for Y axis...

// Step 4: Dimensions
width = 50px
renderedWidth = 50 × 0.792 = 39.6px
cssWidth = 39.6 / 1.1 = 36px
```

## Visibility & Clipping

The `ElementTracker` computes visibility in the iframe:

```typescript
const viewport = {
  x: 0,
  y: 0,
  width: window.innerWidth,
  height: window.innerHeight,
};

const visible = {
  x: Math.max(0, element.x),
  y: Math.max(0, element.y),
  right: Math.min(viewport.width, element.x + element.width),
  bottom: Math.min(viewport.height, element.y + element.height),
};

const visibleWidth = Math.max(0, visible.right - visible.x);
const visibleHeight = Math.max(0, visible.bottom - visible.y);

const isVisible = visibleWidth > 0 && visibleHeight > 0;
const isFullyVisible =
  element.x >= 0 &&
  element.y >= 0 &&
  element.x + element.width <= viewport.width &&
  element.y + element.height <= viewport.height;
```

### Clipping Reasons

- `'offscreen'`: Element completely outside viewport
- `'hidden'`: Element has `display: none` or `visibility: hidden`
- `'collapsed'`: Element has 0 width or height
- `'clipped'`: Element is partially visible (cut off by viewport)

## Border-Radius Scaling

Border-radius values need careful scaling:

```typescript
// Pixel values get scaled
borderRadius.topLeft = "8px" × scale = "6.4px"

// Percentage values stay the same (they're relative to element size)
borderRadius.topLeft = "50%" → "50%"  // stays the same

// Keywords get preserved
borderRadius.topLeft = "rounded" → "rounded"
```

## Scroll Container Handling

The demo shows a pattern for handling iframe scroll:

```typescript
// Track scroll state from iframe
const containerScroll = {
  scrollX: 0,
  scrollY: 100,
  scrollWidth: 1000,
  scrollHeight: 2000
};

// Scale scroll transform
const scaledScrollY = containerScroll.scrollY × iframeScale.scaleY;
const scaledHeight = containerScroll.scrollHeight × iframeScale.scaleY;

// Apply to overlay container
overlayContainer.style.height = `${scaledHeight}px`;
overlayContainer.style.transform = `translate(${-scaledScrollX}px, ${-scaledScrollY}px)`;
```

This keeps overlays positioned correctly as the iframe content scrolls.

## Optimization Patterns

### Pattern 1: Reuse Scale Context

```typescript
const context = positioner.getScaleContext();

// Use same context for multiple elements
elements.forEach((el) => {
  const pos = positioner.transformCoordinates(el.bounds.x, el.bounds.y, context);
  const dims = positioner.transformDimensions(el.bounds.width, el.bounds.height, context);
  // Apply...
});
```

### Pattern 2: Batch Updates

```typescript
// When multiple elements change, recalculate context once
receiver.on('update', (elements) => {
  const context = positioner.getScaleContext();

  elements.forEach((el) => {
    if (!el.visibility.isVisible) {
      hideOverlay(el.id);
    } else {
      const style = positioner.getOverlayStyle(el);
      applyOverlay(el.id, style);
    }
  });
});
```

### Pattern 3: Scroll-Only Detection

```typescript
// If only scroll changed, skip full recalculation
if (lastScroll && scrollChanged && !otherChanges) {
  elements.forEach((el) => {
    const overlay = getOverlay(el.id);
    overlay.style.display = el.visibility.isVisible ? 'block' : 'none';
  });
  return; // Skip coordinate recalculation
}
```

## Testing Scale Combinations

Common test scenarios:

1. **Zoom only**: `iframe { zoom: 0.8 }`
   - Margin scaled: 0.8×
   - Content scaled: 0.8×

2. **Transform only**: `iframe { transform: scale(0.8) }`
   - Margin scaled: 1× (NOT affected)
   - Content scaled: 0.8×

3. **Both**: `iframe { zoom: 0.9; transform: scale(0.8) }`
   - Margin scaled: 0.9×
   - Content scaled: 0.9 × 0.8 = 0.72×

4. **With ancestor**: Parent has `zoom: 1.2`, iframe has `zoom: 0.8`
   - Both scales multiply: 0.8 × 1.2 = 0.96×

5. **Transform with origin**: `transform: scale(0.8); transform-origin: center`
   - Adds origin offset calculation
   - Offset = (1 - 0.8) × centerX = 0.2 × centerX
