import { ElementReceiver } from '../src/receiver';
import { OverlayPositioner } from '../src/overlay-positioner';
import type { ElementRect } from '../src/shared';

// Overlay rendering mode
type OverlayMode = 'passthrough' | 'interactive' | 'labeled' | 'rich';

let currentMode: OverlayMode = 'passthrough';
let receiver: ElementReceiver | null = null;
let positioner: OverlayPositioner | null = null;

// DOM element references
const iframe = document.getElementById('inner-frame') as HTMLIFrameElement;
const overlayContainer = document.getElementById('overlay-container')!;
const statusContent = document.getElementById('status-content')!;

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
 * Initialize ElementReceiver
 */
function initReceiver() {
  receiver = new ElementReceiver(iframe);

  // Create OverlayPositioner independently
  positioner = new OverlayPositioner({ iframe, container: overlayContainer });

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
  const { visibility } = elementRect;
  const metadata = elementRect.metadata as { label?: string } | undefined;

  // Hide overlay if element is not visible
  if (!visibility.isVisible) {
    overlay.style.display = 'none';
    return;
  }

  overlay.style.display = 'block';

  // Use OverlayPositioner to apply position and size
  if (positioner) {
    positioner.applyOverlayStyle(overlay, elementRect);
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

// Bind mode switch button events
Object.entries(modeButtons).forEach(([mode, btn]) => {
  btn.addEventListener('click', () => setMode(mode as OverlayMode));
});

// Test buttons for iframe styles
const testButtons = {
  margin: document.getElementById('test-margin')!,
  padding: document.getElementById('test-padding')!,
  transform: document.getElementById('test-transform')!,
  zoom: document.getElementById('test-zoom')!,
  reset: document.getElementById('test-reset')!,
};

// Track active test states
const testStates = {
  margin: false,
  padding: false,
  transform: false,
  zoom: false,
};

function updateTestButtonStates() {
  testButtons.margin.classList.toggle('active', testStates.margin);
  testButtons.padding.classList.toggle('active', testStates.padding);
  testButtons.transform.classList.toggle('active', testStates.transform);
  testButtons.zoom.classList.toggle('active', testStates.zoom);
}

function applyTestStyles() {
  iframe.style.margin = testStates.margin ? '20px' : '';
  iframe.style.padding = testStates.padding ? '15px' : '';
  iframe.style.transform = testStates.transform ? 'scale(0.8)' : '';
  iframe.style.transformOrigin = testStates.transform ? 'top left' : '';
  iframe.style.zoom = testStates.zoom ? '0.8' : '';

  // Force update overlays
  if (iframe.contentWindow && (iframe.contentWindow as any).tracker) {
    (iframe.contentWindow as any).tracker.forceUpdate();
  }
}

testButtons.margin.addEventListener('click', () => {
  testStates.margin = !testStates.margin;
  updateTestButtonStates();
  applyTestStyles();
});

testButtons.padding.addEventListener('click', () => {
  testStates.padding = !testStates.padding;
  updateTestButtonStates();
  applyTestStyles();
});

testButtons.transform.addEventListener('click', () => {
  testStates.transform = !testStates.transform;
  updateTestButtonStates();
  applyTestStyles();
});

testButtons.zoom.addEventListener('click', () => {
  testStates.zoom = !testStates.zoom;
  updateTestButtonStates();
  applyTestStyles();
});

testButtons.reset.addEventListener('click', () => {
  testStates.margin = false;
  testStates.padding = false;
  testStates.transform = false;
  testStates.zoom = false;
  updateTestButtonStates();
  applyTestStyles();
});

// Initialize after iframe loads
iframe.addEventListener('load', () => {
  console.log('iframe loaded, initializing ElementReceiver');
  initReceiver();

  // Expose to global for debugging (after initialization)
  (window as any).receiver = receiver;
  (window as any).positioner = positioner;
});

(window as any).setMode = setMode;
