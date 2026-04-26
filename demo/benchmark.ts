import { ElementReceiver } from '../src/receiver';
import { OverlayPositioner } from '../src/overlay-positioner';
import type { ElementRect, Bounds, ContainerScroll } from '../src/shared';
import { MESSAGE_TYPE } from '../src/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Side {
  label: string;
  iframe: HTMLIFrameElement;
  receiver: ElementReceiver | null;
  positioner: OverlayPositioner | null;
  overlayContainer: HTMLElement;
  overlayClip: HTMLElement | null; // only for new method
  overlays: Map<string, HTMLElement>;
  samples: number[];
  lastContainerScroll: ContainerScroll | undefined;
}

interface Stats {
  count: number;
  avg: number;
  p50: number;
  p95: number;
  max: number;
}

// ─── State ───────────────────────────────────────────────────────────────────

let benchRunning = false;
let scrollAnimationId: number | null = null;
let statsTimerId: number | null = null;
let scrollDirection = 1; // 1 = down, -1 = up

// ─── DOM refs ────────────────────────────────────────────────────────────────

const btnStart = document.getElementById('btn-start')!;
const btnReset = document.getElementById('btn-reset')!;
const sampleCountEl = document.getElementById('sample-count')!;
const speedupBadge = document.getElementById('speedup-badge')!;
const occSampleCountEl = document.getElementById('occ-sample-count')!;
const occOverheadBadge = document.getElementById('occ-overhead-badge')!;

// Old method side
const oldSide: Side = {
  label: 'old',
  iframe: document.getElementById('iframe-old') as HTMLIFrameElement,
  receiver: null,
  positioner: null,
  overlayContainer: document.getElementById('overlay-container-old')!,
  overlayClip: null,
  overlays: new Map(),
  samples: [],
  lastContainerScroll: undefined,
};

// New method side
const newSide: Side = {
  label: 'new',
  iframe: document.getElementById('iframe-new') as HTMLIFrameElement,
  receiver: null,
  positioner: null,
  overlayContainer: document.getElementById('overlay-container-new')!,
  overlayClip: document.getElementById('overlay-clip-new'),
  overlays: new Map(),
  samples: [],
  lastContainerScroll: undefined,
};

// Occlusion benchmark: Baseline side (no occlusion detection)
const baselineSide: Side = {
  label: 'baseline',
  iframe: document.getElementById('iframe-baseline') as HTMLIFrameElement,
  receiver: null,
  positioner: null,
  overlayContainer: document.getElementById('overlay-container-baseline')!,
  overlayClip: null,
  overlays: new Map(),
  samples: [],
  lastContainerScroll: undefined,
};

// Occlusion benchmark: With occlusion detection side
const occlusionSide: Side = {
  label: 'occlusion',
  iframe: document.getElementById('iframe-occlusion') as HTMLIFrameElement,
  receiver: null,
  positioner: null,
  overlayContainer: document.getElementById('overlay-container-occlusion')!,
  overlayClip: null,
  overlays: new Map(),
  samples: [],
  lastContainerScroll: undefined,
};

// ─── Coordinate helpers ──────────────────────────────────────────────────────

function toDocumentBounds(bounds: Bounds, scroll: { scrollX: number; scrollY: number }): Bounds {
  return {
    x: bounds.x + scroll.scrollX,
    y: bounds.y + scroll.scrollY,
    width: bounds.width,
    height: bounds.height,
  };
}

// ─── Old Method: full recalculation on every update ──────────────────────────

function handleUpdateOld(elements: ElementRect[]) {
  const t0 = performance.now();

  elements.forEach((el) => {
    let overlay = oldSide.overlays.get(el.id);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'bench-overlay';
      overlay.dataset.overlayId = el.id;
      oldSide.overlayContainer.appendChild(overlay);
      oldSide.overlays.set(el.id, overlay);
    }

    if (!el.visibility.isVisible) {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'block';
    // Always use applyOverlayStyle (viewport-relative coords — no document conversion)
    if (oldSide.positioner) {
      oldSide.positioner.applyOverlayStyle(overlay, el);
    }
  });

  const elapsed = performance.now() - t0;
  if (benchRunning) {
    oldSide.samples.push(elapsed);
  }
}

// ─── New Method: scroll-sync + visibility only on scroll ─────────────────────

function syncScrollTransform(side: Side, scroll: ContainerScroll) {
  if (!side.positioner) return;
  const ctx = side.positioner.getScaleContext();
  const scaledScrollY = scroll.scrollY * ctx.iframeScale.scaleY;
  const scaledScrollX = scroll.scrollX * ctx.iframeScale.scaleX;
  const scaledHeight = scroll.scrollHeight * ctx.iframeScale.scaleY;

  side.overlayContainer.style.height = `${scaledHeight}px`;
  side.overlayContainer.style.transform = `translate(${-scaledScrollX}px, ${-scaledScrollY}px)`;
}

function handleUpdateNew(elements: ElementRect[]) {
  const containerScroll = newSide.receiver!.getContainerScroll();
  const t0 = performance.now();

  if (containerScroll) {
    // Always sync the transform
    syncScrollTransform(newSide, containerScroll);

    // Detect scroll-only change
    const scrollChanged =
      newSide.lastContainerScroll &&
      (containerScroll.scrollX !== newSide.lastContainerScroll.scrollX ||
        containerScroll.scrollY !== newSide.lastContainerScroll.scrollY);
    newSide.lastContainerScroll = { ...containerScroll };

    if (scrollChanged) {
      // Scroll-only: just update visibility
      elements.forEach((el) => {
        const overlay = newSide.overlays.get(el.id);
        if (overlay) {
          overlay.style.display = el.visibility.isVisible ? 'block' : 'none';
        }
      });
      const elapsed = performance.now() - t0;
      if (benchRunning) {
        newSide.samples.push(elapsed);
      }
      return;
    }
  }

  // Non-scroll change: full update with document-relative coords
  elements.forEach((el) => {
    let overlay = newSide.overlays.get(el.id);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'bench-overlay';
      overlay.dataset.overlayId = el.id;
      newSide.overlayContainer.appendChild(overlay);
      newSide.overlays.set(el.id, overlay);
    }

    if (!el.visibility.isVisible) {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'block';

    if (newSide.positioner) {
      if (containerScroll) {
        const docBounds = toDocumentBounds(el.bounds, containerScroll);
        const docVisibleBounds = el.visibility.visibleBounds
          ? toDocumentBounds(el.visibility.visibleBounds, containerScroll)
          : null;
        const docClipBounds = el.occlusion?.clipBounds
          ? toDocumentBounds(el.occlusion.clipBounds, containerScroll)
          : (el.occlusion?.clipBounds ?? undefined);
        const docOccluders = el.occlusion?.occluders.map((occ) => ({
          ...occ,
          bounds: toDocumentBounds(occ.bounds, containerScroll),
        }));
        const docRect = {
          ...el,
          bounds: docBounds,
          visibility: {
            ...el.visibility,
            visibleBounds: docVisibleBounds,
          },
          occlusion: el.occlusion
            ? { clipBounds: docClipBounds ?? null, occluders: docOccluders ?? [] }
            : undefined,
        };
        newSide.positioner.applyOverlayStyle(overlay, docRect);
      } else {
        newSide.positioner.applyOverlayStyle(overlay, el);
      }
    }
  });

  const elapsed = performance.now() - t0;
  if (benchRunning) {
    newSide.samples.push(elapsed);
  }
}

// ─── Occlusion Benchmark: tracker-side timing via postMessage ───────────────

// Track last update durations for occlusion benchmark
let lastBaselineDuration = 0;
let lastOcclusionDuration = 0;

window.addEventListener('message', (event) => {
  if (event.data?.type === MESSAGE_TYPE && event.data.updateDuration !== undefined) {
    if (event.source === baselineSide.iframe.contentWindow) {
      lastBaselineDuration = event.data.updateDuration;
    } else if (event.source === occlusionSide.iframe.contentWindow) {
      lastOcclusionDuration = event.data.updateDuration;
    }
  }
});

function handleUpdateBaseline(elements: ElementRect[]) {
  elements.forEach((el) => {
    let overlay = baselineSide.overlays.get(el.id);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'bench-overlay';
      overlay.dataset.overlayId = el.id;
      baselineSide.overlayContainer.appendChild(overlay);
      baselineSide.overlays.set(el.id, overlay);
    }
    if (!el.visibility.isVisible) {
      overlay.style.display = 'none';
      return;
    }
    overlay.style.display = 'block';
    if (baselineSide.positioner) {
      baselineSide.positioner.applyOverlayStyle(overlay, el);
    }
  });

  // Record tracker-side duration from message
  if (benchRunning && lastBaselineDuration > 0) {
    baselineSide.samples.push(lastBaselineDuration);
  }
}

function handleUpdateOcclusion(elements: ElementRect[]) {
  elements.forEach((el) => {
    let overlay = occlusionSide.overlays.get(el.id);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'bench-overlay';
      overlay.dataset.overlayId = el.id;
      occlusionSide.overlayContainer.appendChild(overlay);
      occlusionSide.overlays.set(el.id, overlay);
    }
    if (!el.visibility.isVisible) {
      overlay.style.display = 'none';
      return;
    }
    overlay.style.display = 'block';
    if (occlusionSide.positioner) {
      occlusionSide.positioner.applyOverlayStyle(overlay, el);
    }
  });

  // Record tracker-side duration from message
  if (benchRunning && lastOcclusionDuration > 0) {
    occlusionSide.samples.push(lastOcclusionDuration);
  }
}

// ─── Receiver initialization ─────────────────────────────────────────────────

function initSide(side: Side, handler: (elements: ElementRect[]) => void) {
  side.receiver = new ElementReceiver(side.iframe);

  // Old method uses the overlay container directly (no clip layer)
  // New method uses the clip layer
  const container = side.overlayClip ?? side.overlayContainer;
  side.positioner = new OverlayPositioner({ iframe: side.iframe, container });

  side.receiver.on('init', (elements) => {
    elements.forEach((el) => handler([el]));
  });

  side.receiver.on('update', (elements) => {
    handler(elements);
  });

  side.receiver.on('remove', (elements) => {
    elements.forEach((el) => {
      const overlay = side.overlays.get(el.id);
      if (overlay) {
        overlay.remove();
        side.overlays.delete(el.id);
      }
    });
  });
}

let oldLoaded = false;
let newLoaded = false;
let baselineLoaded = false;
let occlusionLoaded = false;

oldSide.iframe.addEventListener('load', () => {
  console.log('[Benchmark] Old iframe loaded');
  initSide(oldSide, handleUpdateOld);
  oldLoaded = true;
});

newSide.iframe.addEventListener('load', () => {
  console.log('[Benchmark] New iframe loaded');
  initSide(newSide, handleUpdateNew);
  newLoaded = true;
});

baselineSide.iframe.addEventListener('load', () => {
  console.log('[Benchmark] Baseline iframe loaded');
  initSide(baselineSide, handleUpdateBaseline);
  baselineLoaded = true;
});

occlusionSide.iframe.addEventListener('load', () => {
  console.log('[Benchmark] Occlusion iframe loaded');
  initSide(occlusionSide, handleUpdateOcclusion);
  occlusionLoaded = true;
});

// ─── Auto-scroll ─────────────────────────────────────────────────────────────

function scrollStep() {
  if (!benchRunning) return;

  const scrollAmount = 3; // pixels per frame

  // Scroll both iframes simultaneously
  [oldSide, newSide, baselineSide, occlusionSide].forEach((side) => {
    const win = side.iframe.contentWindow;
    if (!win) return;

    win.scrollBy(0, scrollAmount * scrollDirection);

    // Bounce: reverse direction at top/bottom
    const scrollTop = win.scrollY ?? win.document.documentElement.scrollTop;
    const scrollHeight = win.document.documentElement.scrollHeight;
    const clientHeight = win.document.documentElement.clientHeight;

    if (scrollTop + clientHeight >= scrollHeight - 1) {
      scrollDirection = -1;
    } else if (scrollTop <= 0) {
      scrollDirection = 1;
    }
  });

  scrollAnimationId = requestAnimationFrame(scrollStep);
}

// ─── Stats computation ───────────────────────────────────────────────────────

function computeStats(samples: number[]): Stats | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    avg: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    max: sorted[sorted.length - 1],
  };
}

function formatMs(ms: number): string {
  return ms.toFixed(3) + 'ms';
}

function updateStatsDisplay() {
  const oldStats = computeStats(oldSide.samples);
  const newStats = computeStats(newSide.samples);

  const totalSamples = (oldStats?.count ?? 0) + (newStats?.count ?? 0);
  sampleCountEl.textContent = String(totalSamples);

  // Old stats
  if (oldStats) {
    document.getElementById('stat-old-avg')!.textContent = formatMs(oldStats.avg);
    document.getElementById('stat-old-p50')!.textContent = formatMs(oldStats.p50);
    document.getElementById('stat-old-p95')!.textContent = formatMs(oldStats.p95);
    document.getElementById('stat-old-max')!.textContent = formatMs(oldStats.max);
  }

  // New stats
  if (newStats) {
    document.getElementById('stat-new-avg')!.textContent = formatMs(newStats.avg);
    document.getElementById('stat-new-p50')!.textContent = formatMs(newStats.p50);
    document.getElementById('stat-new-p95')!.textContent = formatMs(newStats.p95);
    document.getElementById('stat-new-max')!.textContent = formatMs(newStats.max);
  }

  // Speedup
  if (oldStats && newStats && newStats.avg > 0) {
    const speedup = oldStats.avg / newStats.avg;
    speedupBadge.textContent = `Speedup: ~${speedup.toFixed(1)}x`;
  } else {
    speedupBadge.textContent = 'Speedup: --';
  }

  // Occlusion benchmark stats
  const baselineStats = computeStats(baselineSide.samples);
  const occlusionStats = computeStats(occlusionSide.samples);

  const occTotalSamples = (baselineStats?.count ?? 0) + (occlusionStats?.count ?? 0);
  occSampleCountEl.textContent = String(occTotalSamples);

  if (baselineStats) {
    document.getElementById('stat-baseline-avg')!.textContent = formatMs(baselineStats.avg);
    document.getElementById('stat-baseline-p50')!.textContent = formatMs(baselineStats.p50);
    document.getElementById('stat-baseline-p95')!.textContent = formatMs(baselineStats.p95);
    document.getElementById('stat-baseline-max')!.textContent = formatMs(baselineStats.max);
  }

  if (occlusionStats) {
    document.getElementById('stat-occlusion-avg')!.textContent = formatMs(occlusionStats.avg);
    document.getElementById('stat-occlusion-p50')!.textContent = formatMs(occlusionStats.p50);
    document.getElementById('stat-occlusion-p95')!.textContent = formatMs(occlusionStats.p95);
    document.getElementById('stat-occlusion-max')!.textContent = formatMs(occlusionStats.max);
  }

  if (baselineStats && occlusionStats) {
    const overhead = occlusionStats.avg - baselineStats.avg;
    const pct = baselineStats.avg > 0 ? (overhead / baselineStats.avg) * 100 : 0;
    occOverheadBadge.textContent = `Overhead: +${formatMs(overhead)} (+${pct.toFixed(0)}%)`;
  } else {
    occOverheadBadge.textContent = 'Overhead: --';
  }
}

// ─── Controls ────────────────────────────────────────────────────────────────

btnStart.addEventListener('click', () => {
  if (!oldLoaded || !newLoaded || !baselineLoaded || !occlusionLoaded) {
    console.warn('[Benchmark] Iframes not loaded yet');
    return;
  }

  if (benchRunning) {
    // Stop
    benchRunning = false;
    btnStart.textContent = 'Start';
    btnStart.classList.remove('running');

    if (scrollAnimationId !== null) {
      cancelAnimationFrame(scrollAnimationId);
      scrollAnimationId = null;
    }
    if (statsTimerId !== null) {
      clearInterval(statsTimerId);
      statsTimerId = null;
    }

    // Final stats update
    updateStatsDisplay();
  } else {
    // Start
    benchRunning = true;
    scrollDirection = 1;
    btnStart.textContent = 'Stop';
    btnStart.classList.add('running');

    // Start auto-scroll
    scrollAnimationId = requestAnimationFrame(scrollStep);

    // Start stats refresh (every 500ms)
    statsTimerId = window.setInterval(updateStatsDisplay, 500);
  }
});

btnReset.addEventListener('click', () => {
  // Stop if running
  if (benchRunning) {
    benchRunning = false;
    btnStart.textContent = 'Start';
    btnStart.classList.remove('running');

    if (scrollAnimationId !== null) {
      cancelAnimationFrame(scrollAnimationId);
      scrollAnimationId = null;
    }
    if (statsTimerId !== null) {
      clearInterval(statsTimerId);
      statsTimerId = null;
    }
  }

  // Clear samples
  oldSide.samples = [];
  newSide.samples = [];
  baselineSide.samples = [];
  occlusionSide.samples = [];

  // Reset display
  sampleCountEl.textContent = '0';
  speedupBadge.textContent = 'Speedup: --';
  occSampleCountEl.textContent = '0';
  occOverheadBadge.textContent = 'Overhead: --';

  ['old', 'new'].forEach((side) => {
    ['avg', 'p50', 'p95', 'max'].forEach((stat) => {
      document.getElementById(`stat-${side}-${stat}`)!.textContent = '--';
    });
  });

  ['baseline', 'occlusion'].forEach((side) => {
    ['avg', 'p50', 'p95', 'max'].forEach((stat) => {
      document.getElementById(`stat-${side}-${stat}`)!.textContent = '--';
    });
  });
});
