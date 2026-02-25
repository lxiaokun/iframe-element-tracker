import { ElementTracker } from '../src/tracker';
import { ElementReceiver } from '../src/receiver';
import type { ElementRect } from '../src/shared';

// Overlay rendering mode
type OverlayMode = 'off' | 'passthrough' | 'interactive' | 'labeled' | 'rich';

// Create ElementTracker instance (postMessage to host)
const tracker = new ElementTracker();

// Elements to track
const elementsToTrack = [
  { id: 'element-edge-top', label: 'Edge Top' },
  { id: 'element-edge-left', label: 'Edge Left' },
  { id: 'element-1', label: 'Red Box' },
  { id: 'element-2', label: 'Blue Rounded' },
  { id: 'element-3', label: 'Green Circle' },
  { id: 'element-4', label: 'Purple Rotated' },
  { id: 'element-5', label: 'Orange Fancy' },
  { id: 'element-bottom', label: 'Bottom Element' },
];

// ==================== Same-page overlay ====================

let localOverlayMode: OverlayMode = 'off';
let localReceiver: ElementReceiver | null = null;
let localTracker: ElementTracker | null = null;
const overlayElements: Map<string, HTMLElement> = new Map();

function getOverlayContainer(): HTMLElement {
  return document.getElementById('overlay-container')!;
}

/**
 * Create an overlay element for same-page tracking
 */
function createLocalOverlay(elementRect: ElementRect) {
  const overlay = document.createElement('div');
  overlay.dataset.overlayId = elementRect.id;
  updateLocalOverlayStyle(overlay, elementRect);
  getOverlayContainer().appendChild(overlay);
  overlayElements.set(elementRect.id, overlay);
}

/**
 * Update an overlay element
 */
function updateLocalOverlay(elementRect: ElementRect) {
  let overlay = overlayElements.get(elementRect.id);
  if (!overlay) {
    createLocalOverlay(elementRect);
    return;
  }
  updateLocalOverlayStyle(overlay, elementRect);
}

/**
 * Update overlay style and position using document coordinates
 */
function updateLocalOverlayStyle(overlay: HTMLElement, elementRect: ElementRect) {
  const { bounds, visibility } = elementRect;
  const metadata = elementRect.metadata as { label?: string } | undefined;

  if (!visibility.isVisible) {
    overlay.style.display = 'none';
    return;
  }

  overlay.style.display = 'block';

  // Use document coordinates (absolute container scrolls with body)
  overlay.style.left = `${bounds.x + window.scrollX}px`;
  overlay.style.top = `${bounds.y + window.scrollY}px`;
  overlay.style.width = `${bounds.width}px`;
  overlay.style.height = `${bounds.height}px`;

  // Apply border-radius from tracked element
  const { border } = elementRect.styles;
  overlay.style.borderRadius = `${border.radius.topLeft} ${border.radius.topRight} ${border.radius.bottomRight} ${border.radius.bottomLeft}`;

  // Apply transform if present
  if (elementRect.styles.transform) {
    overlay.style.transform = elementRect.styles.transform;
    overlay.style.transformOrigin = elementRect.styles.transformOrigin;
  } else {
    overlay.style.transform = '';
  }

  // Apply mode-specific styling
  applyLocalOverlayMode(overlay, elementRect, metadata?.label);
}

/**
 * Apply overlay mode styling
 */
function applyLocalOverlayMode(overlay: HTMLElement, elementRect: ElementRect, label?: string) {
  overlay.className = '';
  overlay.innerHTML = '';

  switch (localOverlayMode) {
    case 'passthrough':
      overlay.className = 'overlay-passthrough';
      break;

    case 'interactive':
      overlay.className = 'overlay-interactive';
      overlay.onclick = () => {
        alert(`Clicked on: ${elementRect.id}\nLabel: ${label || 'N/A'}`);
      };
      break;

    case 'labeled': {
      overlay.className = 'overlay-labeled';
      const labelEl = document.createElement('div');
      labelEl.className = 'overlay-label';
      labelEl.textContent = label || elementRect.id;
      overlay.appendChild(labelEl);
      break;
    }

    case 'rich': {
      overlay.className = 'overlay-rich';
      const toolbar = document.createElement('div');
      toolbar.className = 'overlay-toolbar';

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => alert(`Edit: ${elementRect.id}`);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => alert(`Delete: ${elementRect.id}`);

      const link = document.createElement('a');
      link.href = '#';
      link.textContent = 'Details';
      link.onclick = (e) => {
        e.preventDefault();
        alert(`Details for: ${elementRect.id}\n\nBounds: ${JSON.stringify(elementRect.bounds, null, 2)}`);
      };

      toolbar.appendChild(editBtn);
      toolbar.appendChild(deleteBtn);
      toolbar.appendChild(link);
      overlay.appendChild(toolbar);
      break;
    }
  }
}

/**
 * Remove an overlay element
 */
function removeLocalOverlay(id: string) {
  const overlay = overlayElements.get(id);
  if (overlay) {
    overlay.remove();
    overlayElements.delete(id);
  }
}

/**
 * Remove all overlay elements
 */
function removeAllLocalOverlays() {
  overlayElements.forEach((overlay) => overlay.remove());
  overlayElements.clear();
}

/**
 * Start local tracking: create localTracker + localReceiver, register elements
 */
function startLocalTracking() {
  if (localTracker) {
    return;
  }

  localReceiver = new ElementReceiver(null);
  localTracker = new ElementTracker({
    onMessage: (msg) => localReceiver!.handleTrackerMessage(msg),
  });

  localReceiver.on('init', (elements) => {
    elements.forEach((el) => createLocalOverlay(el));
  });

  localReceiver.on('update', (elements) => {
    elements.forEach((el) => updateLocalOverlay(el));
  });

  localReceiver.on('remove', (elements) => {
    elements.forEach((el) => removeLocalOverlay(el.id));
  });

  // Register elements to local tracker
  elementsToTrack.forEach(({ id, label }) => {
    const element = document.getElementById(id);
    if (element) {
      localTracker!.register(element, id, {
        metadata: { label },
      });
    }
  });
}

/**
 * Stop local tracking: destroy localTracker + localReceiver, remove overlays
 */
function stopLocalTracking() {
  if (localTracker) {
    localTracker.destroy();
    localTracker = null;
  }
  if (localReceiver) {
    localReceiver.destroy();
    localReceiver = null;
  }
  removeAllLocalOverlays();
}

/**
 * Set local overlay mode (called from host via postMessage)
 */
function setLocalOverlayMode(mode: OverlayMode) {
  localOverlayMode = mode;

  if (mode === 'off') {
    stopLocalTracking();
    return;
  }

  // Start tracking if not already running
  if (!localTracker) {
    startLocalTracking();
  } else {
    // Re-render all overlays with new mode
    localReceiver?.getElements().forEach((el) => {
      updateLocalOverlay(el);
    });
  }
}

// Listen for control messages from host
window.addEventListener('message', (event) => {
  if (event.data?.type === 'OVERLAY_CONTROL') {
    if (event.data.action === 'setMode') {
      setLocalOverlayMode(event.data.mode);
    }
  }
});

// ==================== Original tracker setup ====================

// Register elements after DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  elementsToTrack.forEach(({ id, label }) => {
    const element = document.getElementById(id);
    if (element) {
      tracker.register(element, id, {
        metadata: { label },
      });
    }
  });

  console.log('ElementTracker initialized, tracking', elementsToTrack.length, 'elements');
});

// Expose to global for debugging
(window as any).tracker = tracker;
(window as any).localTracker = localTracker;
(window as any).setLocalOverlayMode = setLocalOverlayMode;
