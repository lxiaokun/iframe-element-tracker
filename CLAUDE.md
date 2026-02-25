# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**iframe-element-tracker** is a SDK for tracking DOM elements inside iframes and synchronizing their position, size, style, and attribute information to the host page via postMessage.

### Key Concepts

- **ElementTracker**: Runs inside the iframe, registers and tracks DOM elements
- **ElementReceiver**: Runs in the host page, receives element data and emits events
- **ElementRect**: The data structure containing all tracked element information (bounds, visibility, styles, attributes, etc.)

### Prerequisites

This SDK requires control over both the host page and iframe page code (or ability to inject code into the iframe).

## Project Structure

```
iframe-element-tracker/
├── src/
│   ├── shared/              # Shared types and constants
│   │   ├── types.ts         # ElementRect, ElementAttributes, etc.
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
│   └── inner.ts             # Element registration
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

### Transform Handling

For elements with CSS transforms:
- `getBoundingClientRect()` returns the axis-aligned bounding box (AABB) of the transformed element
- SDK uses `offsetWidth/offsetHeight` for original dimensions
- Position is calculated from bounding box center

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
- `demo/host.ts` - Example of how to render overlays based on tracked element data

## Testing Changes

After making changes:
1. Run `npx tsc --noEmit` to check for type errors
2. Run `npm test` to execute unit tests
3. Open http://localhost:3000/demo/host.html in browser
4. Test scroll tracking (should be real-time, no delay)
5. Test different overlay modes (Passthrough, Interactive, Labeled, Rich)
6. Verify overlays align correctly with tracked elements
7. Check that overlays can extend beyond iframe boundaries (in Labeled/Rich modes)
8. Run `npm run test:e2e` for full E2E verification

## Debugging Guidelines

When using Chrome DevTools MCP for debugging:
- **Do NOT use screenshots** - rely on code analysis and DevTools inspection instead
- Use `take_snapshot` to get the DOM structure (a11y tree)
- Use `evaluate_script` to execute JavaScript for checking element properties, computed styles, coordinates, etc.
- Use `list_console_messages` to view console output
- Use `list_network_requests` to inspect network requests
- Combine with code analysis to locate issues
