import { ElementTracker } from '../src/tracker';

// Create ElementTracker instance
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
