import { ReceiverSDK } from '../src/receiver';
import type { ElementRect } from '../src/shared';

// Overlay rendering mode
type OverlayMode = 'passthrough' | 'interactive' | 'labeled' | 'rich';

let currentMode: OverlayMode = 'passthrough';
let receiver: ReceiverSDK | null = null;

// DOM element references
const iframe = document.getElementById('inner-frame') as HTMLIFrameElement;
const overlayContainer = document.getElementById('overlay-container')!;
const statusContent = document.getElementById('status-content')!;

// Get iframe border width (for coordinate offset correction)
function getIframeBorderOffset(): { left: number; top: number } {
  const style = window.getComputedStyle(iframe);
  return {
    left: parseFloat(style.borderLeftWidth) || 0,
    top: parseFloat(style.borderTopWidth) || 0,
  };
}

// Get overlay container offset relative to iframe
function getContainerOffset(): { left: number; top: number } {
  const containerStyle = window.getComputedStyle(overlayContainer);
  return {
    left: parseFloat(containerStyle.left) || 0,
    top: parseFloat(containerStyle.top) || 0,
  };
}

// Mode switch buttons
const modeButtons = {
  passthrough: document.getElementById('mode-passthrough')!,
  interactive: document.getElementById('mode-interactive')!,
  labeled: document.getElementById('mode-labeled')!,
  rich: document.getElementById('mode-rich')!,
};

// Store overlay DOM elements
const overlayElements: Map<string, HTMLElement> = new Map();

/**
 * Initialize ReceiverSDK
 */
function initReceiver() {
  receiver = new ReceiverSDK(iframe);

  receiver.on('init', (elements) => {
    console.log('Received init:', elements);
    elements.forEach((el) => createOverlay(el));
    updateStatus();
  });

  receiver.on('update', (elements) => {
    elements.forEach((el) => updateOverlay(el));
    updateStatus();
  });

  receiver.on('remove', (elements) => {
    elements.forEach((el) => removeOverlay(el.id));
    updateStatus();
  });
}

/**
 * Create overlay element
 */
function createOverlay(elementRect: ElementRect) {
  const overlay = document.createElement('div');
  overlay.dataset.overlayId = elementRect.id;

  updateOverlayStyle(overlay, elementRect);
  overlayContainer.appendChild(overlay);
  overlayElements.set(elementRect.id, overlay);
}

/**
 * Update overlay element
 */
function updateOverlay(elementRect: ElementRect) {
  let overlay = overlayElements.get(elementRect.id);

  if (!overlay) {
    createOverlay(elementRect);
    return;
  }

  updateOverlayStyle(overlay, elementRect);
}

/**
 * Update overlay style and position
 */
function updateOverlayStyle(overlay: HTMLElement, elementRect: ElementRect) {
  const { bounds, visibility, styles } = elementRect;
  const metadata = elementRect.metadata as { label?: string } | undefined;

  // Hide overlay if element is not visible
  if (!visibility.isVisible) {
    overlay.style.display = 'none';
    return;
  }

  overlay.style.display = 'block';

  // Get iframe border offset for coordinate correction
  const borderOffset = getIframeBorderOffset();
  // Get container offset relative to iframe-wrapper (container may be larger than iframe)
  const containerOffset = getContainerOffset();

  // Set position and size
  // bounds.x/y are coordinates within the iframe
  // + borderOffset compensates for iframe border
  // - containerOffset compensates for container's negative offset
  overlay.style.left = `${bounds.x + borderOffset.left - containerOffset.left}px`;
  overlay.style.top = `${bounds.y + borderOffset.top - containerOffset.top}px`;
  overlay.style.width = `${bounds.width}px`;
  overlay.style.height = `${bounds.height}px`;

  // Apply border-radius
  overlay.style.borderRadius = `${styles.border.radius.topLeft} ${styles.border.radius.topRight} ${styles.border.radius.bottomRight} ${styles.border.radius.bottomLeft}`;

  // Apply transform
  if (styles.transform) {
    overlay.style.transform = styles.transform;
    overlay.style.transformOrigin = styles.transformOrigin;
  } else {
    overlay.style.transform = '';
  }

  // Set class name and content based on mode
  applyOverlayMode(overlay, elementRect, metadata?.label);
}

/**
 * Apply overlay mode
 */
function applyOverlayMode(overlay: HTMLElement, elementRect: ElementRect, label?: string) {
  // Clear old class names and child elements
  overlay.className = '';
  overlay.innerHTML = '';

  switch (currentMode) {
    case 'passthrough':
      overlay.className = 'overlay-passthrough';
      break;

    case 'interactive':
      overlay.className = 'overlay-interactive';
      overlay.onclick = () => {
        alert(`Clicked on: ${elementRect.id}\nLabel: ${label || 'N/A'}`);
      };
      break;

    case 'labeled':
      overlay.className = 'overlay-labeled';
      const labelEl = document.createElement('div');
      labelEl.className = 'overlay-label';
      labelEl.textContent = label || elementRect.id;
      overlay.appendChild(labelEl);
      break;

    case 'rich':
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

/**
 * Remove overlay element
 */
function removeOverlay(id: string) {
  const overlay = overlayElements.get(id);
  if (overlay) {
    overlay.remove();
    overlayElements.delete(id);
  }
}

/**
 * Update status panel
 */
function updateStatus() {
  if (!receiver) {
    return;
  }

  const elements = receiver.getElements();

  if (elements.size === 0) {
    statusContent.innerHTML = '<p>No tracked elements</p>';
    return;
  }

  let html = '';
  elements.forEach((el) => {
    const metadata = el.metadata as { label?: string } | undefined;
    const visibleClass = el.visibility.isVisible ? 'visible' : 'hidden';
    html += `
      <div class="element-info ${visibleClass}">
        <strong>${el.id}</strong> (${metadata?.label || 'N/A'})<br>
        Position: (${Math.round(el.bounds.x)}, ${Math.round(el.bounds.y)})<br>
        Size: ${Math.round(el.bounds.width)} x ${Math.round(el.bounds.height)}<br>
        Visible: ${el.visibility.isVisible ? 'Yes' : 'No'}
        ${el.visibility.hiddenReason ? ` (${el.visibility.hiddenReason})` : ''}
      </div>
    `;
  });

  statusContent.innerHTML = html;
}

/**
 * Switch overlay mode
 */
function setMode(mode: OverlayMode) {
  currentMode = mode;

  // Update button states
  Object.entries(modeButtons).forEach(([key, btn]) => {
    btn.classList.toggle('active', key === mode);
  });

  // Re-render all overlays
  if (receiver) {
    receiver.getElements().forEach((el) => {
      updateOverlay(el);
    });
  }
}

/**
 * Re-render all overlays (when mode switches)
 */
function rerenderOverlays() {
  if (!receiver) return;

  receiver.getElements().forEach((el) => {
    const overlay = overlayElements.get(el.id);
    if (overlay) {
      const metadata = el.metadata as { label?: string } | undefined;
      applyOverlayMode(overlay, el, metadata?.label);
    }
  });
}

// Bindmode switch button events
Object.entries(modeButtons).forEach(([mode, btn]) => {
  btn.addEventListener('click', () => setMode(mode as OverlayMode));
});

// Initialize after iframe loads
iframe.addEventListener('load', () => {
  console.log('iframe loaded, initializing ReceiverSDK');
  initReceiver();
});

// Expose to global for debugging
(window as any).receiver = receiver;
(window as any).setMode = setMode;
