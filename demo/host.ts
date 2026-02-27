import { ElementReceiver } from '../src/receiver';
import { OverlayPositioner } from '../src/overlay-positioner';
import type { ElementRect } from '../src/shared';

// Overlay rendering mode
type OverlayMode = 'off' | 'passthrough' | 'interactive' | 'labeled' | 'rich';

let currentMode: OverlayMode = 'passthrough';
let receiver: ElementReceiver | null = null;
let positioner: OverlayPositioner | null = null;

// DOM element references
const iframe = document.getElementById('inner-frame') as HTMLIFrameElement;
const overlayContainer = document.getElementById('overlay-container')!;
const statusContent = document.getElementById('status-content')!;

// Mode switch buttons
const modeButtons = {
  off: document.getElementById('mode-off')!,
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
  if (currentMode === 'off') return;

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
  if (currentMode === 'off') return;

  const overlay = overlayElements.get(elementRect.id);

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

  if (mode === 'off') {
    // Remove all overlays
    overlayElements.forEach((overlay) => overlay.remove());
    overlayElements.clear();
    return;
  }

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
  border: document.getElementById('test-border')!,
  transform: document.getElementById('test-transform')!,
  scaleUp: document.getElementById('test-scale-up')!,
  translate: document.getElementById('test-translate')!,
  originCenter: document.getElementById('test-origin-center')!,
  zoom: document.getElementById('test-zoom')!,
  wrapperZoom: document.getElementById('test-wrapper-zoom')!,
  reset: document.getElementById('test-reset')!,
};

const iframeWrapper = document.querySelector('.iframe-wrapper') as HTMLElement;

// Track active test states
const testStates = {
  margin: false,
  padding: false,
  border: false,
  transform: false,
  scaleUp: false,
  translate: false,
  originCenter: false,
  zoom: false,
  wrapperZoom: false,
};

// Transform-type buttons are mutually exclusive (they all set iframe.style.transform)
const transformKeys = ['transform', 'scaleUp', 'translate', 'originCenter'] as const;

function updateTestButtonStates() {
  testButtons.margin.classList.toggle('active', testStates.margin);
  testButtons.padding.classList.toggle('active', testStates.padding);
  testButtons.border.classList.toggle('active', testStates.border);
  testButtons.transform.classList.toggle('active', testStates.transform);
  testButtons.scaleUp.classList.toggle('active', testStates.scaleUp);
  testButtons.translate.classList.toggle('active', testStates.translate);
  testButtons.originCenter.classList.toggle('active', testStates.originCenter);
  testButtons.zoom.classList.toggle('active', testStates.zoom);
  testButtons.wrapperZoom.classList.toggle('active', testStates.wrapperZoom);
}

function applyTestStyles() {
  iframe.style.margin = testStates.margin ? '20px' : '';
  iframe.style.padding = testStates.padding ? '15px' : '';
  iframe.style.borderWidth = testStates.border ? '8px' : '';
  iframe.style.zoom = testStates.zoom ? '0.8' : '';

  // Determine transform and transformOrigin from mutually exclusive transform buttons
  if (testStates.transform) {
    iframe.style.transform = 'scale(0.8)';
    iframe.style.transformOrigin = 'top left';
  } else if (testStates.scaleUp) {
    iframe.style.transform = 'scale(1.2)';
    iframe.style.transformOrigin = 'top left';
  } else if (testStates.translate) {
    iframe.style.transform = 'translate(30px, 20px)';
    iframe.style.transformOrigin = '';
  } else if (testStates.originCenter) {
    iframe.style.transform = 'scale(0.8)';
    iframe.style.transformOrigin = 'center';
  } else {
    iframe.style.transform = '';
    iframe.style.transformOrigin = '';
  }

  // Wrapper zoom applies to the ancestor element
  iframeWrapper.style.zoom = testStates.wrapperZoom ? '0.9' : '';

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

testButtons.border.addEventListener('click', () => {
  testStates.border = !testStates.border;
  updateTestButtonStates();
  applyTestStyles();
});

// Transform-type buttons: mutually exclusive
function toggleTransformButton(key: (typeof transformKeys)[number]) {
  const wasActive = testStates[key];
  // Deactivate all transform buttons
  for (const k of transformKeys) {
    testStates[k] = false;
  }
  // Toggle the clicked one
  testStates[key] = !wasActive;
  updateTestButtonStates();
  applyTestStyles();
}

testButtons.transform.addEventListener('click', () => toggleTransformButton('transform'));
testButtons.scaleUp.addEventListener('click', () => toggleTransformButton('scaleUp'));
testButtons.translate.addEventListener('click', () => toggleTransformButton('translate'));
testButtons.originCenter.addEventListener('click', () => toggleTransformButton('originCenter'));

testButtons.zoom.addEventListener('click', () => {
  testStates.zoom = !testStates.zoom;
  updateTestButtonStates();
  applyTestStyles();
});

testButtons.wrapperZoom.addEventListener('click', () => {
  testStates.wrapperZoom = !testStates.wrapperZoom;
  updateTestButtonStates();
  applyTestStyles();
});

testButtons.reset.addEventListener('click', () => {
  testStates.margin = false;
  testStates.padding = false;
  testStates.border = false;
  testStates.transform = false;
  testStates.scaleUp = false;
  testStates.translate = false;
  testStates.originCenter = false;
  testStates.zoom = false;
  testStates.wrapperZoom = false;
  updateTestButtonStates();
  applyTestStyles();
});

// Element style test buttons
const elemTestButtons = {
  hover: document.getElementById('elem-test-hover')!,
  margin: document.getElementById('elem-test-margin')!,
  padding: document.getElementById('elem-test-padding')!,
  border: document.getElementById('elem-test-border')!,
  borderRadius: document.getElementById('elem-test-border-radius')!,
  boxSizing: document.getElementById('elem-test-box-sizing')!,
  scale: document.getElementById('elem-test-scale')!,
  rotate: document.getElementById('elem-test-rotate')!,
  opacity: document.getElementById('elem-test-opacity')!,
  pseudo: document.getElementById('elem-test-pseudo')!,
  reset: document.getElementById('elem-test-reset')!,
};

// Element style test states
const elemTestStates = {
  hover: false,
  margin: false,
  padding: false,
  border: false,
  borderRadius: false,
  boxSizing: false,
  scale: false,
  rotate: false,
  opacity: false,
  pseudo: false,
};

// Scale and Rotate are mutually exclusive (both set transform)
const elemTransformKeys = ['scale', 'rotate'] as const;

function updateElemTestButtonStates() {
  elemTestButtons.hover.classList.toggle('active', elemTestStates.hover);
  elemTestButtons.margin.classList.toggle('active', elemTestStates.margin);
  elemTestButtons.padding.classList.toggle('active', elemTestStates.padding);
  elemTestButtons.border.classList.toggle('active', elemTestStates.border);
  elemTestButtons.borderRadius.classList.toggle('active', elemTestStates.borderRadius);
  elemTestButtons.boxSizing.classList.toggle('active', elemTestStates.boxSizing);
  elemTestButtons.scale.classList.toggle('active', elemTestStates.scale);
  elemTestButtons.rotate.classList.toggle('active', elemTestStates.rotate);
  elemTestButtons.opacity.classList.toggle('active', elemTestStates.opacity);
  elemTestButtons.pseudo.classList.toggle('active', elemTestStates.pseudo);
}

function sendElementStyleUpdate() {
  iframe.contentWindow?.postMessage(
    {
      type: 'ELEMENT_STYLE_CONTROL',
      action: 'applyStyles',
      styles: elemTestStates,
    },
    '*',
  );
}

elemTestButtons.hover.addEventListener('click', () => {
  elemTestStates.hover = !elemTestStates.hover;
  updateElemTestButtonStates();
  sendElementStyleUpdate();
});

elemTestButtons.margin.addEventListener('click', () => {
  elemTestStates.margin = !elemTestStates.margin;
  updateElemTestButtonStates();
  sendElementStyleUpdate();
});

elemTestButtons.padding.addEventListener('click', () => {
  elemTestStates.padding = !elemTestStates.padding;
  updateElemTestButtonStates();
  sendElementStyleUpdate();
});

elemTestButtons.border.addEventListener('click', () => {
  elemTestStates.border = !elemTestStates.border;
  updateElemTestButtonStates();
  sendElementStyleUpdate();
});

elemTestButtons.borderRadius.addEventListener('click', () => {
  elemTestStates.borderRadius = !elemTestStates.borderRadius;
  updateElemTestButtonStates();
  sendElementStyleUpdate();
});

elemTestButtons.boxSizing.addEventListener('click', () => {
  elemTestStates.boxSizing = !elemTestStates.boxSizing;
  updateElemTestButtonStates();
  sendElementStyleUpdate();
});

function toggleElemTransformButton(key: (typeof elemTransformKeys)[number]) {
  const wasActive = elemTestStates[key];
  for (const k of elemTransformKeys) {
    elemTestStates[k] = false;
  }
  elemTestStates[key] = !wasActive;
  updateElemTestButtonStates();
  sendElementStyleUpdate();
}

elemTestButtons.scale.addEventListener('click', () => toggleElemTransformButton('scale'));
elemTestButtons.rotate.addEventListener('click', () => toggleElemTransformButton('rotate'));

elemTestButtons.opacity.addEventListener('click', () => {
  elemTestStates.opacity = !elemTestStates.opacity;
  updateElemTestButtonStates();
  sendElementStyleUpdate();
});

elemTestButtons.pseudo.addEventListener('click', () => {
  elemTestStates.pseudo = !elemTestStates.pseudo;
  updateElemTestButtonStates();
  sendElementStyleUpdate();
});

elemTestButtons.reset.addEventListener('click', () => {
  elemTestStates.hover = false;
  elemTestStates.margin = false;
  elemTestStates.padding = false;
  elemTestStates.border = false;
  elemTestStates.borderRadius = false;
  elemTestStates.boxSizing = false;
  elemTestStates.scale = false;
  elemTestStates.rotate = false;
  elemTestStates.opacity = false;
  elemTestStates.pseudo = false;
  updateElemTestButtonStates();
  sendElementStyleUpdate();
});

// Inner overlay mode buttons
type InnerOverlayMode = 'off' | 'passthrough' | 'interactive' | 'labeled' | 'rich';
const innerModeButtons: Record<InnerOverlayMode, HTMLElement> = {
  off: document.getElementById('inner-mode-off')!,
  passthrough: document.getElementById('inner-mode-passthrough')!,
  interactive: document.getElementById('inner-mode-interactive')!,
  labeled: document.getElementById('inner-mode-labeled')!,
  rich: document.getElementById('inner-mode-rich')!,
};

function setInnerMode(mode: InnerOverlayMode) {
  Object.entries(innerModeButtons).forEach(([key, btn]) => {
    btn.classList.toggle('active', key === mode);
  });

  // Send control message to iframe
  iframe.contentWindow?.postMessage(
    {
      type: 'OVERLAY_CONTROL',
      action: 'setMode',
      mode,
    },
    '*',
  );
}

Object.entries(innerModeButtons).forEach(([mode, btn]) => {
  btn.addEventListener('click', () => setInnerMode(mode as InnerOverlayMode));
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
