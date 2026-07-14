# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, etc.) when working with code in this repository. `CLAUDE.md` is a symlink to this file.

## Project Overview

**iframe-element-tracker** is a SDK for tracking DOM elements inside iframes and synchronizing their position, size, style, and attribute information to the host page via postMessage.

### Key Concepts

- **ElementTracker**: Runs inside the iframe, registers and tracks DOM elements
- **ElementReceiver**: Runs in the host page, receives element data and emits events
- **ElementRect**: The data structure containing all tracked element information (bounds, visibility, styles, attributes, etc.)
- **OcclusionInfo**: Tracks ancestor overflow clipping and z-index occlusion data for each element
- **OverlayPositioner**: Runs in the host page, transforms iframe coordinates to overlay CSS coordinates, including clip-path for clipped/occluded elements

### Prerequisites

This SDK requires control over both the host page and iframe page code (or ability to inject code into the iframe).

## Project Structure

```
iframe-element-tracker/
├── src/
│   ├── index.ts             # Public entry - re-exports all modules
│   ├── shared/              # Shared types and constants
│   │   ├── types.ts         # ElementRect, ElementAttributes, ScaleContext, etc.
│   │   ├── constants.ts     # MESSAGE_TYPE, throttle delay
│   │   └── index.ts         # Re-exports
│   ├── tracker/             # ElementTracker (iframe side)
│   │   └── index.ts
│   ├── receiver/            # ElementReceiver (host side)
│   │   └── index.ts
│   └── overlay-positioner/  # OverlayPositioner (host side)
│       └── index.ts
├── tests/
│   ├── helpers/             # Test utilities
│   │   ├── fixtures.ts      # ElementRect/ScaleContext factory functions
│   │   └── dom-mocks.ts     # ResizeObserver/IntersectionObserver stubs
│   ├── unit/                # Unit tests (Vitest)
│   │   ├── overlay-positioner.test.ts
│   │   ├── receiver.test.ts
│   │   └── tracker.test.ts
│   └── e2e/                 # E2E tests (Playwright)
│       └── overlay.spec.ts
├── demo/                    # Demo pages showing overlay rendering
│   ├── host.html            # Host page with overlay container
│   ├── host.ts              # Overlay rendering logic
│   ├── inner.html           # iframe content with tracked elements
│   ├── inner.ts             # Element registration
│   ├── benchmark.html       # Performance benchmark page
│   └── benchmark.ts         # Benchmark logic
├── DESIGN.md                # Detailed design documentation (Chinese)
├── README.md                # English documentation
└── README.zh-CN.md          # Chinese documentation
```

## Common Development Commands

```bash
# Install dependencies
npm install

# Start development server (Vite)
npm run dev

# Build for production
npm run build

# Type check without emitting
npx tsc --noEmit

# Run unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run unit tests with coverage
npm run test:coverage

# Run E2E tests (auto-starts dev server if needed)
npm run test:e2e
```

The dev server runs at http://localhost:3000, demo page at http://localhost:3000/demo/host.html

## Architecture Notes

### Communication Flow

1. ElementTracker registers elements and observes changes (ResizeObserver, IntersectionObserver, scroll/resize events)
2. On change, ElementTracker sends ElementRect data via `postMessage` to parent window
3. ElementReceiver listens for messages, validates source, updates internal state
4. ElementReceiver emits events ('init', 'update', 'remove') that host page can subscribe to

### Coordinate System

- ElementRect.bounds contains coordinates relative to the **iframe viewport**
- When rendering overlays in host page, must account for:
  - iframe position in host page (`iframe.getBoundingClientRect()`)
  - iframe border width
  - overlay container offset (if container extends beyond iframe)

### Coordinate System Pitfalls

**CRITICAL**: ElementRect fields use the **iframe viewport** coordinate system. When converting to document coordinates for overlay rendering, ALL coordinate fields must be converted together:

- `bounds` — element position and size
- `visibility.visibleBounds` — visible area after clipping
- `occlusion.clipBounds` — ancestor overflow clip rect
- `occlusion.occluders[].bounds` — occluder positions

If `bounds` is converted to document coordinates but `visibleBounds` is left in viewport coordinates, `computeClipPath()` will calculate incorrect insets (potentially hundreds of pixels), effectively hiding the overlay.

**Pattern in `host.ts`**: The `toDocumentBounds()` helper must be applied to ALL bounds fields, not just `bounds`:

```typescript
// WRONG — only converts bounds, visibleBounds stays viewport-relative
const docRect = { ...elementRect, bounds: toDocumentBounds(elementRect.bounds, scroll) };

// RIGHT — converts all coordinate fields together
const docRect = {
  ...elementRect,
  bounds: toDocumentBounds(elementRect.bounds, scroll),
  visibility: { ...elementRect.visibility, visibleBounds: toDocumentBounds(visibleBounds, scroll) },
  occlusion: { clipBounds: toDocumentBounds(clipBounds, scroll), occluders: ... },
};
```

### Transform Handling

For elements with CSS transforms:

- `getBoundingClientRect()` returns the axis-aligned bounding box (AABB) of the transformed element
- SDK uses `offsetWidth/offsetHeight` for original dimensions
- Position is calculated from bounding box center

### Occlusion Detection

Two types of element occlusion are detected:

1. **Ancestor overflow clipping** (always enabled): Walks the DOM ancestor chain to find elements with `overflow:hidden/auto/scroll`. Computes the intersection of all clipping ancestors' rects with the viewport to produce `visibleBounds`. Per-axis: `overflow-x` and `overflow-y` are checked independently.

2. **Z-index occlusion** (opt-in via `detectOcclusion`): Uses `elementFromPoint()` grid sampling across the element's visible area to detect overlapping elements. Returns an array of `OccluderRect` with each occluder's bounds.

**Overlay rendering**: `OverlayPositioner.computeClipPath()` converts occlusion data to CSS clip-path:

- Overflow clipping only → `clip-path: inset(top right bottom left)` with negative margins on unclipped sides (allows labels/toolbars to overflow)
- Z-index occlusion → `clip-path: path(evenodd, "...")` with outer rect + counterclockwise hole rects

**Two overlay rendering paths exist** (both must handle clipping):

- Host overlay: `demo/host.ts` → `OverlayPositioner.applyOverlayStyle()` — handles clip-path automatically
- Inner overlay: `demo/inner.ts` → `computeLocalClipPath()` — separate implementation for same-page mode

## Deep-Dive References

Detailed analysis documents for AI-assisted development (not user-facing):

- [`.claude/references/DESIGN.md`](.claude/references/DESIGN.md) — Original design document (Chinese), architecture rationale and API design decisions
- [`.claude/references/CODEBASE_ANALYSIS.md`](.claude/references/CODEBASE_ANALYSIS.md) — Merged codebase analysis: ElementTracker, ElementReceiver, OverlayPositioner internals, data flow, event system, demo structure
- [`.claude/references/COORDINATE_TRANSFORMATION_GUIDE.md`](.claude/references/COORDINATE_TRANSFORMATION_GUIDE.md) — Coordinate transformation math: CSS zoom vs transform, margin/content scaling, transform matrix parsing, the complete 6-step formula
- [`.claude/references/ARCHITECTURE_DIAGRAM.md`](.claude/references/ARCHITECTURE_DIAGRAM.md) — ASCII architecture diagrams: component relationships, observer stack, bounds calculation flow, message sequence

## Code Style

- All source code comments should be in English
- Use TypeScript with strict typing
- Follow existing patterns for new features
- Git commits should follow Conventional Commits specification:
  - `feat(scope): description` - New features
  - `fix(scope): description` - Bug fixes
  - `docs(scope): description` - Documentation
  - `refactor(scope): description` - Code refactoring

## Development Workflow

After completing a feature, always follow these steps in order:

1. **Run tests** - Execute `npm test` for unit tests, `npm run test:e2e` for E2E tests
2. **Run and fix lint errors** - Execute `npx tsc --noEmit` and fix any type errors
3. **Update documentation** - Update README.md and README.zh-CN.md if API changes
4. **Commit code** - Use Conventional Commits format

## Key Files to Understand

- `src/shared/types.ts` - All TypeScript interfaces (ElementRect, ElementAttributes, ElementStyles, etc.)
- `src/tracker/index.ts` - ElementTracker implementation with observers and update logic
- `src/receiver/index.ts` - ElementReceiver implementation with event system
- `src/overlay-positioner/index.ts` - OverlayPositioner with coordinate transforms and clip-path computation
- `demo/host.ts` - Example of how to render overlays based on tracked element data
- `demo/inner.ts` - Inner overlay rendering with local clip-path (second overlay rendering path)

## Testing Changes

After making changes:

1. Run `npx tsc --noEmit` to check for type errors
2. Run `npm test` to execute unit tests
3. **Visual verification BEFORE writing E2E tests** — Open http://localhost:3000/demo/host.html in browser:
   - Test scroll tracking (should be real-time, no delay)
   - Test different overlay modes (Passthrough, Interactive, Labeled, Rich)
   - Verify overlays align correctly with tracked elements
   - **Verify clipped elements**: overlay boundaries should match the overflow container, not the element's full size
   - **Verify occluded elements**: overlay should have holes where occluders cover
   - **Toggle Clip button** to compare clipped vs unclipped overlays
   - **Enable Inner Overlay** and verify it also clips correctly
   - Check that overlays can extend beyond iframe boundaries (in Labeled/Rich modes)
   - Toggle iframe styles (zoom, scale, margin) and verify overlays still align
4. Run `npm run test:e2e` for full E2E verification

### E2E Test Guidelines

- **Never test only string format** — `expect(clipPath).toContain('inset(')` misses completely wrong values
- **Verify visual bounds** — Check that clip-path inset values are within the element's dimensions
- **Test coordinate consistency** — When scrolling is involved, verify bounds and visibleBounds are in the same coordinate system
- **Test both overlay paths** — Host overlay (via OverlayPositioner) AND inner overlay (via computeLocalClipPath)

## Debugging Guidelines

When using Chrome DevTools MCP for debugging:

- **Do NOT use screenshots** - rely on code analysis and DevTools inspection instead
- Use `take_snapshot` to get the DOM structure (a11y tree)
- Use `evaluate_script` to execute JavaScript for checking element properties, computed styles, coordinates, etc.
- Use `list_console_messages` to view console output
- Use `list_network_requests` to inspect network requests
- Combine with code analysis to locate issues
