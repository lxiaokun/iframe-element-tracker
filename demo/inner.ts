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
let unsubscribeListener: (() => void) | null = null;
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
  const overlay = overlayElements.get(elementRect.id);
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
        alert(
          `Details for: ${elementRect.id}\n\nBounds: ${JSON.stringify(elementRect.bounds, null, 2)}`,
        );
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
 * Start local tracking: create localReceiver, subscribe to tracker via addMessageListener
 */
function startLocalTracking() {
  if (unsubscribeListener) {
    return;
  }

  localReceiver = new ElementReceiver(null);

  localReceiver.on('init', (elements) => {
    elements.forEach((el) => createLocalOverlay(el));
  });

  localReceiver.on('update', (elements) => {
    elements.forEach((el) => updateLocalOverlay(el));
  });

  localReceiver.on('remove', (elements) => {
    elements.forEach((el) => removeLocalOverlay(el.id));
  });

  // Subscribe to tracker — auto-replays current state as 'init'
  unsubscribeListener = tracker.addMessageListener((msg) =>
    localReceiver!.handleTrackerMessage(msg),
  );
}

/**
 * Stop local tracking: unsubscribe from tracker, destroy localReceiver, remove overlays
 */
function stopLocalTracking() {
  if (unsubscribeListener) {
    unsubscribeListener();
    unsubscribeListener = null;
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
  if (!unsubscribeListener) {
    startLocalTracking();
  } else {
    // Re-render all overlays with new mode
    localReceiver?.getElements().forEach((el) => {
      updateLocalOverlay(el);
    });
  }
}

/**
 * Apply style values to element-1
 */
function setElementStyles(el: HTMLElement, styles: Record<string, boolean>) {
  el.style.margin = styles.margin ? '30px' : '';
  el.style.padding = styles.padding ? '40px' : '';
  el.style.border = styles.border ? '8px solid #2980b9' : '';
  el.style.borderRadius = styles.borderRadius ? '50%' : '';
  el.style.boxSizing = styles.boxSizing ? 'content-box' : '';

  if (styles.scale) {
    el.style.transform = 'scale(1.3)';
    el.style.transformOrigin = 'top left';
  } else if (styles.rotate) {
    el.style.transform = 'rotate(15deg)';
    el.style.transformOrigin = '';
  } else {
    el.style.transform = '';
    el.style.transformOrigin = '';
  }

  el.style.opacity = styles.opacity ? '0.3' : '';

  el.classList.toggle('has-pseudo', !!styles.pseudo);
}

/**
 * Clear all test styles from element-1
 */
function clearElementStyles(el: HTMLElement) {
  el.style.margin = '';
  el.style.padding = '';
  el.style.border = '';
  el.style.borderRadius = '';
  el.style.boxSizing = '';
  el.style.transform = '';
  el.style.transformOrigin = '';
  el.style.opacity = '';
  el.classList.remove('has-pseudo');
}

// ==================== Hover mode state ====================

let hoverMode = false;
let pendingStyles: Record<string, boolean> | null = null;
let hoverEnterHandler: (() => void) | null = null;
let hoverLeaveHandler: (() => void) | null = null;

function attachHoverListeners(el: HTMLElement) {
  if (hoverEnterHandler) return; // already attached

  hoverEnterHandler = () => {
    if (pendingStyles) {
      setElementStyles(el, pendingStyles);
      tracker.forceUpdate();
    }
  };
  hoverLeaveHandler = () => {
    clearElementStyles(el);
    tracker.forceUpdate();
  };

  el.addEventListener('mouseenter', hoverEnterHandler);
  el.addEventListener('mouseleave', hoverLeaveHandler);
}

function detachHoverListeners(el: HTMLElement) {
  if (hoverEnterHandler) {
    el.removeEventListener('mouseenter', hoverEnterHandler);
    hoverEnterHandler = null;
  }
  if (hoverLeaveHandler) {
    el.removeEventListener('mouseleave', hoverLeaveHandler);
    hoverLeaveHandler = null;
  }
}

/**
 * Apply test styles to element-1 based on host control panel state
 */
function applyElementTestStyles(styles: Record<string, boolean>) {
  const el = document.getElementById('element-1') as HTMLElement;
  if (!el) return;

  if (styles.hover) {
    // Hover mode: store styles, clear element, attach listeners
    pendingStyles = styles;
    hoverMode = true;
    clearElementStyles(el);
    tracker.forceUpdate();
    attachHoverListeners(el);
  } else {
    // Immediate mode: detach listeners, apply styles directly
    if (hoverMode) {
      detachHoverListeners(el);
      hoverMode = false;
      pendingStyles = null;
    }
    setElementStyles(el, styles);
    tracker.forceUpdate();
  }
}

// Listen for control messages from host
window.addEventListener('message', (event) => {
  if (event.data?.type === 'OVERLAY_CONTROL') {
    if (event.data.action === 'setMode') {
      setLocalOverlayMode(event.data.mode);
    }
  }
  if (event.data?.type === 'ELEMENT_STYLE_CONTROL') {
    if (event.data.action === 'applyStyles') {
      applyElementTestStyles(event.data.styles);
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
(window as any).setLocalOverlayMode = setLocalOverlayMode;
