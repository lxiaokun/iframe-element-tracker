# ElementTracker Architecture Diagrams

## 1. Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Host Page                              │
│                                                                 │
│  ┌────────────────────────────────────────────────────┐        │
│  │         ElementReceiver (Data Layer)               │        │
│  │                                                    │        │
│  │  • Listen for postMessage from iframe             │        │
│  │  • Validate origin & source window                │        │
│  │  • Maintain element state cache                   │        │
│  │  • Emit events: 'init', 'update', 'remove'       │        │
│  │  • Provide query API: getElement(id)             │        │
│  │  • Track scroll container state                  │        │
│  └────────────────────────────────────────────────────┘        │
│                         ↑                                      │
│                         │ postMessage                          │
│                         │                                      │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Overlay Container                         │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │ OverlayPositioner                              │  │  │
│  │  │                                                │  │  │
│  │  │ • Calculate ScaleContext (all transform info) │  │  │
│  │  │ • transformCoordinates() - iframe→host coords │  │  │
│  │  │ • transformDimensions() - scale sizes         │  │  │
│  │  │ • Apply CSS to overlay elements               │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │  Overlay Elements (div, canvas, etc)                  │  │
│  │  • Follow tracked elements                           │  │
│  │  • Can extend beyond iframe boundaries              │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌────────────────────────────┐                               │
│  │ <iframe>                   │                               │
│  │                            │                               │
│  │ ┌──────────────────────┐  │                               │
│  │ │ ElementTracker       │  │                               │
│  │ │ (Tracking Layer)     │  │                               │
│  │ │                      │  │                               │
│  │ │ • Register elements  │  │                               │
│  │ │ • Observe changes    │  │                               │
│  │ │ • Calculate state    │  │                               │
│  │ │ • Send via postMsg   │  │                               │
│  │ └──────────────────────┘  │                               │
│  │                            │                               │
│  │ DOM Elements               │                               │
│  │ (button, div, etc)         │                               │
│  └────────────────────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2. ElementTracker Observer Stack

```
┌────────────────────────────────────────────────────────┐
│ Element Change Detection (ElementTracker)              │
└────────────────────────────────────────────────────────┘
              │
              ├─── ResizeObserver ─────────────────────────┐
              │    ✓ Detects width/height changes          │
              │    ✓ Observes all registered elements      │
              │    → scheduleUpdate() via requestAnimationFrame
              │                                            │
              ├─── IntersectionObserver ──────────────────┐
              │    ✓ Detects viewport visibility changes  │
              │    ✓ 11 thresholds [0, 0.1...1]          │
              │    ✓ Tracks visibility percentage         │
              │    → scheduleUpdate() via requestAnimationFrame
              │                                            │
              ├─── Scroll Events ──────────────────────────┐
              │    ✓ window.scroll or custom container     │
              │    ✓ passive: true, capture: true         │
              │    → performUpdate() [SYNCHRONOUS]         │
              │    ✓ NO THROTTLING for real-time response │
              │                                            │
              └─── Resize Events ─────────────────────────┐
                   ✓ window.resize                        │
                   → performUpdate() [SYNCHRONOUS]         │
                   ✓ NO THROTTLING for responsiveness    │

                   ↓↓↓

┌────────────────────────────────────────────────────────┐
│ Update Scheduling                                      │
├────────────────────────────────────────────────────────┤
│                                                        │
│ ResizeObserver/IntersectionObserver:                  │
│ ┌────────────────────────────────────────────────┐   │
│ │ scheduleUpdate()                               │   │
│ │  if (pendingUpdate !== null) return; // Skip   │   │
│ │  pendingUpdate = requestAnimationFrame(() => { │   │
│ │    performUpdate(); // Batched in next frame   │   │
│ │  });                                           │   │
│ └────────────────────────────────────────────────┘   │
│                                                        │
│ Scroll/Resize Events:                                │
│ ┌────────────────────────────────────────────────┐   │
│ │ performUpdate() // CALLED IMMEDIATELY           │   │
│ │ // No requestAnimationFrame, no batching        │   │
│ └────────────────────────────────────────────────┘   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

## 3. Element Bounds Calculation Flow

```
┌─────────────────────────────────────────────────────────┐
│ getElementRect(element) - Comprehensive State Capture   │
└─────────────────────────────────────────────────────────┘
              │
              ├─── 1. Get Bounding Rectangle
              │    domRect = element.getBoundingClientRect()
              │    Returns AABB (Axis-Aligned Bounding Box)
              │
              ├─── 2. Get Computed Styles
              │    const computedStyle = getComputedStyle(element)
              │
              ├─── 3. Check for Transform
              │    ├─ If transform is 'none' → simple case
              │    │  bounds = { x: domRect.x, y: domRect.y, ... }
              │    │
              │    └─ If transform exists → complex case
              │       ├─ Parse matrix(a, b, c, d, e, f)
              │       ├─ Get offsetWidth/offsetHeight (original dims)
              │       ├─ Get transformOrigin (ox, oy)
              │       ├─ Transform 4 corners of original box
              │       │  for each corner (px, py):
              │       │    tx = ox + a*(px-ox) + c*(py-oy) + e
              │       │    ty = oy + b*(px-ox) + d*(py-oy) + f
              │       ├─ Find minimum transformed coords
              │       └─ Reverse-calculate untransformed position
              │          x = domRect.x - minTX
              │          y = domRect.y - minTY
              │
              ├─── 4. Calculate Visibility
              │    ├─ Check CSS display/visibility
              │    ├─ Check size (0 width/height = collapsed)
              │    ├─ Calculate viewport intersection
              │    ├─ Determine hiddenReason
              │    └─ Calculate visibleBounds (if clipped)
              │
              ├─── 5. Extract Styles
              │    ├─ Box model: padding, margin, border
              │    ├─ Transform: transform, transformOrigin
              │    ├─ Clipping: overflow, clipPath
              │    ├─ Display: display, opacity, zIndex
              │    └─ Effects: boxShadow, filter, outline
              │
              ├─── 6. Extract Attributes
              │    ├─ DOM id attribute
              │    ├─ CSS classes
              │    └─ data-* attributes
              │
              ├─── 7. Check Scroll State
              │    if (scrollWidth > clientWidth || scrollHeight > clientHeight)
              │      return { top, left, width, height }
              │
              └─── 8. Compile ElementRect
                   {
                     id, timestamp, attributes, bounds,
                     visibility, styles, scroll?, metadata?
                   }
```

## 4. Visibility Determination Tree

```
                    Element
                       │
                       ↓
        Is display: none or visibility: hidden?
                   ↙ YES    NO ↘
              'hidden'         │
                               ↓
                    Is width or height 0?
                   ↙ YES    NO ↘
              'collapsed'      │
                               ↓
        Calculate viewport intersection:
        visibleX = max(0, elemX)
        visibleY = max(0, elemY)
        visibleRight = min(viewportW, elemX + elemW)
        visibleBottom = min(viewportH, elemY + elemH)
        visibleWidth = max(0, visibleRight - visibleX)
        visibleHeight = max(0, visibleBottom - visibleY)
                       │
                       ↓
        Is visibleWidth or visibleHeight 0?
                   ↙ YES    NO ↘
              'offscreen'      │
                               ↓
        Is element fully within viewport?
        (elemX >= 0 && elemY >= 0 &&
         elemX + elemW <= viewportW &&
         elemY + elemH <= viewportH)
                   ↙ YES    NO ↘
          isFullyVisible=true    isFullyVisible=false
          hiddenReason=undefined hiddenReason='clipped'
                                 visibleBounds calculated
```

## 5. Message Flow Sequence

```
TIME ──────────────────────────────────────────────────────→

iframe page:
┌──────────────────────────────────────────────────────────┐
│ 1. User scrolls / element resizes                        │
│    ↓                                                     │
│ 2. Event fired (ResizeObserver, scroll event, etc)       │
│    ↓                                                     │
│ 3a. ResizeObserver/IntersectionObserver:                │
│     scheduleUpdate() → set pendingUpdate                │
│     ↓                                                   │
│     [wait for next animation frame]                    │
│     ↓                                                   │
│ 3b. Scroll/Resize event:                               │
│     performUpdate() → IMMEDIATELY                       │
│     ↓                                                   │
│ 4. Iterate all tracked elements                         │
│    for each element: getElementRect()                  │
│    ↓                                                   │
│ 5. Build ElementRect[] array                            │
│    ↓                                                   │
│ 6. Get containerScroll state                           │
│    ↓                                                   │
│ 7. Build TrackerMessage:                              │
│    {                                                   │
│      type: 'IFRAME_ELEMENT_TRACKER',                   │
│      action: 'update',                                 │
│      elements: [...],                                  │
│      containerScroll: {...}                            │
│    }                                                   │
│    ↓                                                   │
│ 8a. If onMessage callback: call it directly           │
│ 8b. If postMessage: targetWindow.postMessage()        │
│    ↓                                                   │
│ 9. Call additional listeners                           │
└──────────────────────────────────────────────────────────┘
                     ║ postMessage ║
                     ║ (across iframe boundary)
                     ↓
host page:
┌──────────────────────────────────────────────────────────┐
│ 10. window.message event received                        │
│     ↓                                                    │
│ 11. ElementReceiver.handleMessage()                      │
│     ├─ Check if destroyed                               │
│     ├─ Validate origin                                  │
│     ├─ Validate source === iframe.contentWindow         │
│     ├─ Validate message.type === 'IFRAME_ELEMENT_...'  │
│     ↓                                                    │
│ 12. Update containerScroll                              │
│     ↓                                                    │
│ 13. Route by action:                                    │
│     'init': handleInit(elements)                        │
│     'update': handleUpdate(elements)                    │
│     'remove': handleRemove(elements)                    │
│     ↓                                                    │
│ 14. Update internal state cache                         │
│     elements.set(id, elementRect)                       │
│     ↓                                                    │
│ 15. Emit event to listeners                             │
│     for each callback in listeners[action]:             │
│       callback(elements)                                │
│     ↓                                                    │
│ 16. Application code handles event                      │
│     receiver.on('update', (elements) => {               │
│       updateOverlayPositions(elements)                  │
│     })                                                  │
│     ↓                                                    │
│ 17. OverlayPositioner calculates new CSS                │
│     getScaleContext()                                   │
│     transformCoordinates()                              │
│     transformDimensions()                               │
│     ↓                                                    │
│ 18. Apply styles to overlay elements                    │
│     overlay.style.left = '...'                          │
│     overlay.style.top = '...'                           │
│     overlay.style.transform = '...'                     │
│     ↓                                                    │
│ 19. 🎨 Overlays update on screen                        │
└──────────────────────────────────────────────────────────┘
```

## 6. Coordinate Transform Math

```
Iframe Space → Host Page Space Transformation

Source: ElementRect.bounds in iframe coordinate system
        (element position relative to iframe viewport)

Input: iframeX, iframeY (element position in iframe)

Step 1: Get Scale Context
┌────────────────────────────────────────────┐
│ iframeZoom = parseFloat(iframe.zoom)       │
│ iframeTransform = parse transform matrix   │
│ ancestorScale = walk up DOM tree           │
│ iframeMargin = iframe.marginLeft/Top       │
│ iframeBorderPadding = border + padding     │
│ containerOffset = container.left/top       │
└────────────────────────────────────────────┘

Step 2: Calculate margin scale
        (zoom affects margin, transform doesn't)
┌────────────────────────────────────────────┐
│ marginScale.x = iframeZoom × ancestorScale │
│ marginScale.y = iframeZoom × ancestorScale │
└────────────────────────────────────────────┘

Step 3: Calculate translate from transform
┌────────────────────────────────────────────┐
│ translateRendered.x = iframeTranslate × zoom × ancestor
│ translateRendered.y = iframeTranslate × zoom × ancestor
└────────────────────────────────────────────┘

Step 4: Calculate element's rendered position
┌────────────────────────────────────────────┐
│ elementPos.x = iframeMargin × marginScale +
│               translateRendered +
│               (borderPadding + iframeX) × combinedScale
│
│ elementPos.y = iframeMargin × marginScale +
│               translateRendered +
│               (borderPadding + iframeY) × combinedScale
└────────────────────────────────────────────┘

Step 5: Account for container offset
┌────────────────────────────────────────────┐
│ containerPos.x = container.left × ancestorScale
│ containerPos.y = container.top × ancestorScale
│
│ overlayPos.x = elementPos.x - containerPos.x
│ overlayPos.y = elementPos.y - containerPos.y
└────────────────────────────────────────────┘

Step 6: Convert to CSS values
        (divide by ancestorScale because CSS will scale)
┌────────────────────────────────────────────┐
│ CSS.left = overlayPos.x / ancestorScale.x
│ CSS.top = overlayPos.y / ancestorScale.y
└────────────────────────────────────────────┘

Output: CSS left/top values for overlay element
```

## 7. State Management

```
ElementReceiver State Cache

┌─────────────────────────────────────────────┐
│ elements: Map<id, ElementRect>              │
│                                             │
│ ID → ElementRect                            │
│ 'btn-1' → { bounds, visibility, styles... }│
│ 'card-1' → { bounds, visibility, styles... }
│ 'input-1' → { bounds, visibility, styles...}
│                                             │
│ Methods:                                    │
│ • get(id) - O(1) lookup                    │
│ • set(id, rect) - O(1) update              │
│ • getElements() - O(N) copy all            │
│ • delete(id) - O(1) remove                 │
└─────────────────────────────────────────────┘

Event Listeners

┌─────────────────────────────────────────────┐
│ listeners: Map<action, Set<callback>>       │
│                                             │
│ 'init' → [callback1, callback2, ...]       │
│ 'update' → [callback3, callback4, ...]     │
│ 'remove' → [callback5, ...]                │
│                                             │
│ When message received:                     │
│ 1. Update cache (elements map)             │
│ 2. Call all listeners for that action      │
│ 3. Pass affected elements to each callback │
└─────────────────────────────────────────────┘
```

## 8. Performance Model

```
Update Latency Timeline
(per element, worst case)

┌─────────────────────────────────────────────────────────┐
│ Event fires (scroll, resize, ResizeObserver, etc)      │
│ │                                                       │
│ ├─ For scroll/resize: performUpdate() [SYNC]           │
│ │  Time: < 1ms                                         │
│ │                                                       │
│ └─ For ResizeObserver/IntersectionObserver:            │
│    scheduleUpdate()                                    │
│    │                                                   │
│    └─ Wait for requestAnimationFrame (0-16ms at 60fps)│
│       performUpdate()                                  │
│       Time: < 1ms per element                         │
│                                                        │
│ For each tracked element:                             │
│ │                                                      │
│ ├─ getBoundingClientRect(): < 0.1ms                   │
│ ├─ getComputedStyle(): < 0.1ms                        │
│ ├─ Parse transform (if needed): < 0.1ms               │
│ ├─ Calculate visibility: < 0.1ms                      │
│ └─ Extract styles & attributes: < 0.1ms               │
│                                                        │
│ Array of N elements: O(N) × 0.5ms = 0.5N ms           │
│                                                        │
│ postMessage overhead: 0.1-0.5ms                       │
│ Message deserialization (host): 0.1-0.5ms             │
│                                                        │
│ Total per scroll event (100 elements):                │
│ ~50ms computation + 1ms communication                 │
│                                                        │
└─────────────────────────────────────────────────────────┘

For smooth 60fps scrolling:
• Can afford ~16ms per frame
• With 100 elements: ~0.16ms per element
• Should be achievable, but depends on CSS complexity

Recommendations:
• Use RAF throttling for ResizeObserver/IntersectionObserver ✓
• Don't throttle scroll/resize events ✓
• Consider sampling if tracking > 500 elements
```

## 9. Typical Usage Flow

```
INITIALIZATION PHASE
┌────────────────────────────────────────────────────────────┐
│ iframe page:                                               │
│ const tracker = new ElementTracker()                       │
│ tracker.register(buttonEl, 'btn-1', {                     │
│   metadata: { label: 'Primary Button' }                   │
│ })                                                         │
│ tracker.register(cardEl, 'card-1')                        │
│                                                            │
│ Immediately sends 'init' message with current state       │
└────────────────────────────────────────────────────────────┘

HOST PAGE INITIALIZATION
┌────────────────────────────────────────────────────────────┐
│ const receiver = new ElementReceiver(iframe)              │
│                                                            │
│ receiver.on('init', (elements) => {                       │
│   elements.forEach(el => createOverlay(el))              │
│ })                                                         │
│                                                            │
│ receiver.on('update', (elements) => {                    │
│   elements.forEach(el => updateOverlay(el))              │
│ })                                                         │
│                                                            │
│ receiver.on('remove', (elements) => {                    │
│   elements.forEach(el => removeOverlay(el.id))           │
│ })                                                         │
└────────────────────────────────────────────────────────────┘

RUNTIME PHASE (Scroll/Resize)
┌────────────────────────────────────────────────────────────┐
│ User scrolls within iframe                                │
│   ↓                                                        │
│ Scroll event fired (synchronous)                          │
│   ↓                                                        │
│ ElementTracker.performUpdate() [NO THROTTLE]              │
│   ↓                                                        │
│ Recalculate all element bounds/visibility                │
│   ↓                                                        │
│ Send 'update' message                                    │
│   ↓                                                        │
│ ElementReceiver receives message                         │
│   ↓                                                        │
│ Update internal element cache                             │
│   ↓                                                        │
│ Emit 'update' event to listeners                         │
│   ↓                                                        │
│ Host application updateOverlay()                          │
│   ↓                                                        │
│ OverlayPositioner calculates new CSS                     │
│   ↓                                                        │
│ Apply CSS to overlay element                             │
│   ↓                                                        │
│ 🎨 Overlay smoothly follows tracked element              │
│   ↓                                                        │
│ [60fps if CPU permits]                                   │
└────────────────────────────────────────────────────────────┘

CLEANUP PHASE
┌────────────────────────────────────────────────────────────┐
│ When element is no longer needed:                         │
│ tracker.unregister('btn-1')                              │
│   ↓                                                        │
│ Unobserve element (ResizeObserver, IntersectionObserver) │
│   ↓                                                        │
│ Send 'remove' message                                    │
│   ↓                                                        │
│ ElementReceiver emits 'remove' event                     │
│   ↓                                                        │
│ Host removes overlay element                             │
└────────────────────────────────────────────────────────────┘
```
