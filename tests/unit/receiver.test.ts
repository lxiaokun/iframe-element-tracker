import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementReceiver } from '../../src/receiver';
import { MESSAGE_TYPE } from '../../src/shared';
import { createElementRect } from '../helpers/fixtures';
import type { TrackerMessage, ElementRect } from '../../src/shared';

/**
 * Dispatch a simulated postMessage event.
 */
function dispatchMessage(
  data: unknown,
  source: Window | null = null,
  origin: string = 'http://localhost'
): void {
  const event = new MessageEvent('message', {
    data,
    source,
    origin,
  });
  window.dispatchEvent(event);
}

/**
 * Create a valid TrackerMessage.
 */
function createTrackerMessage(
  action: TrackerMessage['action'],
  elements: ElementRect[]
): TrackerMessage {
  return {
    type: MESSAGE_TYPE,
    action,
    elements,
  };
}

describe('ElementReceiver', () => {
  let iframe: HTMLIFrameElement;
  let receiver: ElementReceiver;
  let mockContentWindow: Window;

  beforeEach(() => {
    iframe = document.createElement('iframe');
    document.body.appendChild(iframe);

    // Mock contentWindow
    mockContentWindow = {} as Window;
    Object.defineProperty(iframe, 'contentWindow', {
      get: () => mockContentWindow,
      configurable: true,
    });

    receiver = new ElementReceiver(iframe);
  });

  afterEach(() => {
    receiver.destroy();
    iframe.remove();
  });

  // ==================== message handling ====================

  describe('message handling', () => {
    it('stores elements and fires init event on init message', () => {
      const callback = vi.fn();
      receiver.on('init', callback);

      const elements = [createElementRect({ id: 'el-1' }), createElementRect({ id: 'el-2' })];
      const msg = createTrackerMessage('init', elements);
      dispatchMessage(msg, mockContentWindow);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(elements);
      expect(receiver.getElement('el-1')).toBeDefined();
      expect(receiver.getElement('el-2')).toBeDefined();
    });

    it('updates elements and fires update event on update message', () => {
      const initCallback = vi.fn();
      const updateCallback = vi.fn();
      receiver.on('init', initCallback);
      receiver.on('update', updateCallback);

      // Init first
      const initElements = [createElementRect({ id: 'el-1', bounds: { x: 0, y: 0, width: 100, height: 50 } })];
      dispatchMessage(createTrackerMessage('init', initElements), mockContentWindow);

      // Then update
      const updatedElements = [createElementRect({ id: 'el-1', bounds: { x: 50, y: 50, width: 100, height: 50 } })];
      dispatchMessage(createTrackerMessage('update', updatedElements), mockContentWindow);

      expect(updateCallback).toHaveBeenCalledOnce();
      expect(receiver.getElement('el-1')!.bounds.x).toBe(50);
    });

    it('removes elements and fires remove event on remove message', () => {
      const removeCallback = vi.fn();
      receiver.on('remove', removeCallback);

      // Init first
      const initElements = [createElementRect({ id: 'el-1' })];
      dispatchMessage(createTrackerMessage('init', initElements), mockContentWindow);
      expect(receiver.getElement('el-1')).toBeDefined();

      // Then remove
      dispatchMessage(
        createTrackerMessage('remove', [{ id: 'el-1' } as ElementRect]),
        mockContentWindow
      );

      expect(removeCallback).toHaveBeenCalledOnce();
      expect(receiver.getElement('el-1')).toBeUndefined();
    });

    it('ignores messages from non-target iframe source', () => {
      const callback = vi.fn();
      receiver.on('init', callback);

      const msg = createTrackerMessage('init', [createElementRect()]);
      // Source is a different window (not the iframe's contentWindow)
      dispatchMessage(msg, window);

      expect(callback).not.toHaveBeenCalled();
    });

    it('ignores messages with wrong type', () => {
      const callback = vi.fn();
      receiver.on('init', callback);

      dispatchMessage(
        { type: 'WRONG_TYPE', action: 'init', elements: [createElementRect()] },
        mockContentWindow
      );

      expect(callback).not.toHaveBeenCalled();
    });

    it('ignores non-object messages', () => {
      const callback = vi.fn();
      receiver.on('init', callback);

      dispatchMessage('string message', mockContentWindow);
      dispatchMessage(null, mockContentWindow);
      dispatchMessage(42, mockContentWindow);

      expect(callback).not.toHaveBeenCalled();
    });

    it('validates allowedOrigin when specified', () => {
      receiver.destroy();
      receiver = new ElementReceiver(iframe, { allowedOrigin: 'https://allowed.com' });

      const callback = vi.fn();
      receiver.on('init', callback);

      const msg = createTrackerMessage('init', [createElementRect()]);

      // Wrong origin
      dispatchMessage(msg, mockContentWindow, 'https://evil.com');
      expect(callback).not.toHaveBeenCalled();

      // Correct origin
      dispatchMessage(msg, mockContentWindow, 'https://allowed.com');
      expect(callback).toHaveBeenCalledOnce();
    });
  });

  // ==================== state management ====================

  describe('state management', () => {
    it('getElements returns a copy of all elements', () => {
      const elements = [
        createElementRect({ id: 'el-1' }),
        createElementRect({ id: 'el-2' }),
      ];
      dispatchMessage(createTrackerMessage('init', elements), mockContentWindow);

      const result = receiver.getElements();
      expect(result.size).toBe(2);
      expect(result.get('el-1')).toBeDefined();
      expect(result.get('el-2')).toBeDefined();

      // Verify it's a copy (modifying it doesn't affect internal state)
      result.delete('el-1');
      expect(receiver.getElement('el-1')).toBeDefined();
    });

    it('getElement returns a single element', () => {
      const rect = createElementRect({ id: 'my-el' });
      dispatchMessage(createTrackerMessage('init', [rect]), mockContentWindow);

      const result = receiver.getElement('my-el');
      expect(result).toBeDefined();
      expect(result!.id).toBe('my-el');
    });

    it('getElement returns undefined for non-existent id', () => {
      expect(receiver.getElement('non-existent')).toBeUndefined();
    });
  });

  // ==================== event system ====================

  describe('event system', () => {
    it('on() registers callback that receives events', () => {
      const callback = vi.fn();
      receiver.on('update', callback);

      const elements = [createElementRect({ id: 'el-1' })];
      dispatchMessage(createTrackerMessage('update', elements), mockContentWindow);

      expect(callback).toHaveBeenCalledWith(elements);
    });

    it('off() removes callback', () => {
      const callback = vi.fn();
      receiver.on('update', callback);
      receiver.off('update', callback);

      dispatchMessage(
        createTrackerMessage('update', [createElementRect()]),
        mockContentWindow
      );

      expect(callback).not.toHaveBeenCalled();
    });

    it('multiple callbacks fire in order', () => {
      const order: number[] = [];
      const callback1 = vi.fn(() => order.push(1));
      const callback2 = vi.fn(() => order.push(2));

      receiver.on('init', callback1);
      receiver.on('init', callback2);

      dispatchMessage(
        createTrackerMessage('init', [createElementRect()]),
        mockContentWindow
      );

      expect(order).toEqual([1, 2]);
    });

    it('callback error does not affect other callbacks', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const callback1 = vi.fn(() => {
        throw new Error('test error');
      });
      const callback2 = vi.fn();

      receiver.on('init', callback1);
      receiver.on('init', callback2);

      dispatchMessage(
        createTrackerMessage('init', [createElementRect()]),
        mockContentWindow
      );

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  // ==================== lifecycle ====================

  describe('lifecycle', () => {
    it('ignores messages after destroy', () => {
      const callback = vi.fn();
      receiver.on('init', callback);

      receiver.destroy();

      dispatchMessage(
        createTrackerMessage('init', [createElementRect()]),
        mockContentWindow
      );

      expect(callback).not.toHaveBeenCalled();
    });

    it('clears elements and listeners on destroy', () => {
      dispatchMessage(
        createTrackerMessage('init', [createElementRect({ id: 'el-1' })]),
        mockContentWindow
      );
      expect(receiver.getElements().size).toBe(1);

      receiver.destroy();
      expect(receiver.getElements().size).toBe(0);
    });

    it('multiple destroy calls do not throw', () => {
      expect(() => {
        receiver.destroy();
        receiver.destroy();
        receiver.destroy();
      }).not.toThrow();
    });
  });

  // ==================== accessors ====================

  describe('accessors', () => {
    it('getIframe returns the bound iframe', () => {
      expect(receiver.getIframe()).toBe(iframe);
    });
  });
});
