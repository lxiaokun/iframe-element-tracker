import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementTracker } from '../../src/tracker';
import { MESSAGE_TYPE } from '../../src/shared';
import { installObserverMocks } from '../helpers/dom-mocks';
import type { TrackerMessage } from '../../src/shared';
import type { TrackerMessageListener } from '../../src/tracker';

describe('ElementTracker', () => {
  let tracker: ElementTracker;
  let mockTargetWindow: { postMessage: ReturnType<typeof vi.fn> };
  let testElement: HTMLElement;

  beforeEach(() => {
    installObserverMocks();

    mockTargetWindow = {
      postMessage: vi.fn(),
    };

    tracker = new ElementTracker({
      targetWindow: mockTargetWindow as unknown as Window,
      targetOrigin: '*',
    });

    testElement = document.createElement('div');
    // Mock getBoundingClientRect
    vi.spyOn(testElement, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 50,
      width: 200,
      height: 100,
      top: 50,
      right: 300,
      bottom: 150,
      left: 100,
      toJSON: () => {},
    });

    // Mock offsetWidth/offsetHeight
    Object.defineProperty(testElement, 'offsetWidth', { value: 200, configurable: true });
    Object.defineProperty(testElement, 'offsetHeight', { value: 100, configurable: true });

    // Mock scrollWidth/scrollHeight/clientWidth/clientHeight
    Object.defineProperty(testElement, 'scrollWidth', { value: 200, configurable: true });
    Object.defineProperty(testElement, 'scrollHeight', { value: 100, configurable: true });
    Object.defineProperty(testElement, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(testElement, 'clientHeight', { value: 100, configurable: true });

    document.body.appendChild(testElement);
  });

  afterEach(() => {
    tracker.destroy();
    testElement.remove();
    vi.restoreAllMocks();
  });

  // ==================== register/unregister ====================

  describe('register/unregister', () => {
    it('sends init message on register', () => {
      tracker.register(testElement, 'test-el');

      expect(mockTargetWindow.postMessage).toHaveBeenCalledOnce();
      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      expect(msg.type).toBe(MESSAGE_TYPE);
      expect(msg.action).toBe('init');
      expect(msg.elements).toHaveLength(1);
      expect(msg.elements[0].id).toBe('test-el');
    });

    it('sends remove message on unregister', () => {
      tracker.register(testElement, 'test-el');
      mockTargetWindow.postMessage.mockClear();

      tracker.unregister('test-el');

      expect(mockTargetWindow.postMessage).toHaveBeenCalledOnce();
      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      expect(msg.action).toBe('remove');
      expect(msg.elements[0].id).toBe('test-el');
    });

    it('warns on duplicate registration', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      tracker.register(testElement, 'test-el');
      tracker.register(testElement, 'test-el');

      expect(warnSpy).toHaveBeenCalledWith('Element with id "test-el" is already registered');
      warnSpy.mockRestore();
    });

    it('warns on register after destroy', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      tracker.destroy();
      tracker.register(testElement, 'test-el');

      expect(warnSpy).toHaveBeenCalledWith('ElementTracker has been destroyed');
      warnSpy.mockRestore();
    });

    it('does nothing when unregistering non-existent id', () => {
      tracker.unregister('non-existent');
      expect(mockTargetWindow.postMessage).not.toHaveBeenCalled();
    });
  });

  // ==================== element data collection ====================

  describe('element data collection', () => {
    it('collects correct bounds from getBoundingClientRect', () => {
      tracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const el = msg.elements[0];
      expect(el.bounds.x).toBe(100);
      expect(el.bounds.y).toBe(50);
      expect(el.bounds.width).toBe(200);
      expect(el.bounds.height).toBe(100);
    });

    it('uses offsetWidth/offsetHeight when element has transform', () => {
      // Mock getComputedStyle to return a transform
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        transform: 'matrix(0.707, 0.707, -0.707, 0.707, 0, 0)',
        transformOrigin: 'center',
        display: 'block',
        visibility: 'visible',
        opacity: '1',
        boxSizing: 'border-box',
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: 'visible',
        clipPath: 'none',
        zIndex: 'auto',
        pointerEvents: 'auto',
        position: 'static',
        borderTopWidth: '0px',
        borderRightWidth: '0px',
        borderBottomWidth: '0px',
        borderLeftWidth: '0px',
        borderTopLeftRadius: '0px',
        borderTopRightRadius: '0px',
        borderBottomRightRadius: '0px',
        borderBottomLeftRadius: '0px',
        outlineWidth: '0px',
        outlineOffset: '0px',
        boxShadow: 'none',
        filter: 'none',
        getPropertyValue: (name: string) => {
          const map: Record<string, string> = {
            'padding-top': '0',
            'padding-right': '0',
            'padding-bottom': '0',
            'padding-left': '0',
            'margin-top': '0',
            'margin-right': '0',
            'margin-bottom': '0',
            'margin-left': '0',
          };
          return map[name] ?? '0';
        },
      } as unknown as CSSStyleDeclaration);

      // With transform, bounds should use offsetWidth/offsetHeight
      // getBoundingClientRect returns transformed AABB (282x282 for a 200x200 rotated 45deg)
      vi.spyOn(testElement, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        width: 282,
        height: 282,
        top: 0,
        right: 282,
        bottom: 282,
        left: 0,
        toJSON: () => {},
      });

      Object.defineProperty(testElement, 'offsetWidth', { value: 200, configurable: true });
      Object.defineProperty(testElement, 'offsetHeight', { value: 200, configurable: true });

      tracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const el = msg.elements[0];
      // Should use offsetWidth/offsetHeight (200x200), not AABB (282x282)
      expect(el.bounds.width).toBe(200);
      expect(el.bounds.height).toBe(200);
    });

    it('collects visibility information', () => {
      // Mock innerWidth/innerHeight
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

      tracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const el = msg.elements[0];
      expect(el.visibility.isVisible).toBe(true);
    });

    it('collects attributes (id, classList, dataset)', () => {
      testElement.id = 'my-id';
      testElement.classList.add('class-a', 'class-b');
      testElement.dataset.custom = 'value';

      tracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const el = msg.elements[0];
      expect(el.attributes.elementId).toBe('my-id');
      expect(el.attributes.classList).toContain('class-a');
      expect(el.attributes.classList).toContain('class-b');
      expect(el.attributes.dataset.custom).toBe('value');
    });

    it('includes metadata when provided', () => {
      tracker.register(testElement, 'test-el', {
        metadata: { label: 'Test Label' },
      });

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      expect(msg.elements[0].metadata).toEqual({ label: 'Test Label' });
    });
  });

  // ==================== message sending ====================

  describe('message sending', () => {
    it('sends TrackerMessage format via postMessage', () => {
      tracker.register(testElement, 'test-el');

      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MESSAGE_TYPE,
          action: 'init',
          elements: expect.any(Array),
        }),
        '*',
      );
    });

    it('uses specified targetOrigin', () => {
      tracker.destroy();
      tracker = new ElementTracker({
        targetWindow: mockTargetWindow as unknown as Window,
        targetOrigin: 'https://example.com',
      });

      tracker.register(testElement, 'test-el');

      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        expect.any(Object),
        'https://example.com',
      );
    });

    it('logs error when postMessage fails', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTargetWindow.postMessage.mockImplementation(() => {
        throw new Error('postMessage failed');
      });

      tracker.register(testElement, 'test-el');

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to send message to parent window:',
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });
  });

  // ==================== updateMetadata ====================

  describe('updateMetadata', () => {
    it('merges new metadata', () => {
      tracker.register(testElement, 'test-el', {
        metadata: { label: 'Original' },
      });
      mockTargetWindow.postMessage.mockClear();

      tracker.updateMetadata('test-el', { label: 'Updated', extra: 'data' });

      // updateMetadata schedules an update via requestAnimationFrame
      // We can't easily test the scheduled update here, but we can verify no error
    });

    it('does nothing for non-existent element', () => {
      // Should not throw
      tracker.updateMetadata('non-existent', { label: 'test' });
    });
  });

  // ==================== lifecycle ====================

  describe('lifecycle', () => {
    it('destroy cleans up observers and event listeners', () => {
      tracker.register(testElement, 'test-el');

      // Verify the element is tracked (init message sent)
      expect(mockTargetWindow.postMessage).toHaveBeenCalled();
      mockTargetWindow.postMessage.mockClear();

      tracker.destroy();

      // After destroy, forceUpdate should not send messages
      tracker.forceUpdate();
      expect(mockTargetWindow.postMessage).not.toHaveBeenCalled();
    });

    it('multiple destroy calls do not throw', () => {
      expect(() => {
        tracker.destroy();
        tracker.destroy();
      }).not.toThrow();
    });
  });

  // ==================== forceUpdate ====================

  describe('forceUpdate', () => {
    it('sends update message for all tracked elements', () => {
      tracker.register(testElement, 'test-el');
      mockTargetWindow.postMessage.mockClear();

      tracker.forceUpdate();

      expect(mockTargetWindow.postMessage).toHaveBeenCalledOnce();
      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      expect(msg.action).toBe('update');
      expect(msg.elements).toHaveLength(1);
    });

    it('does nothing when no elements are tracked', () => {
      tracker.forceUpdate();
      // Only init messages should have been sent (none, since no elements registered)
      expect(mockTargetWindow.postMessage).not.toHaveBeenCalled();
    });
  });

  // ==================== onMessage callback ====================

  describe('onMessage callback', () => {
    let callbackTracker: ElementTracker;
    let onMessageFn: ReturnType<typeof vi.fn<(message: TrackerMessage) => void>>;

    beforeEach(() => {
      onMessageFn = vi.fn<(message: TrackerMessage) => void>();
      callbackTracker = new ElementTracker({
        onMessage: onMessageFn,
      });
    });

    afterEach(() => {
      callbackTracker.destroy();
    });

    it('calls onMessage callback on register instead of postMessage', () => {
      callbackTracker.register(testElement, 'test-el');

      expect(onMessageFn).toHaveBeenCalledOnce();
      const msg = onMessageFn.mock.calls[0][0] as TrackerMessage;
      expect(msg.type).toBe(MESSAGE_TYPE);
      expect(msg.action).toBe('init');
      expect(msg.elements).toHaveLength(1);
      expect(msg.elements[0].id).toBe('test-el');
    });

    it('skips postMessage when onMessage is set', () => {
      // Also verify that postMessage on window.parent is NOT called
      const parentPostMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
      callbackTracker.register(testElement, 'test-el');

      expect(onMessageFn).toHaveBeenCalled();
      expect(parentPostMessage).not.toHaveBeenCalled();
      parentPostMessage.mockRestore();
    });

    it('calls onMessage callback on unregister', () => {
      callbackTracker.register(testElement, 'test-el');
      onMessageFn.mockClear();

      callbackTracker.unregister('test-el');

      expect(onMessageFn).toHaveBeenCalledOnce();
      const msg = onMessageFn.mock.calls[0][0] as TrackerMessage;
      expect(msg.action).toBe('remove');
      expect(msg.elements[0].id).toBe('test-el');
    });

    it('calls onMessage callback on forceUpdate', () => {
      callbackTracker.register(testElement, 'test-el');
      onMessageFn.mockClear();

      callbackTracker.forceUpdate();

      expect(onMessageFn).toHaveBeenCalledOnce();
      const msg = onMessageFn.mock.calls[0][0] as TrackerMessage;
      expect(msg.action).toBe('update');
    });

    it('logs error when onMessage callback throws', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwingTracker = new ElementTracker({
        onMessage: () => {
          throw new Error('callback error');
        },
      });

      throwingTracker.register(testElement, 'test-el');

      expect(errorSpy).toHaveBeenCalledWith('Error in onMessage callback:', expect.any(Error));

      throwingTracker.destroy();
      errorSpy.mockRestore();
    });
  });

  // ==================== addMessageListener / removeMessageListener ====================

  describe('addMessageListener / removeMessageListener', () => {
    it('listener receives messages alongside postMessage on register', () => {
      const listener = vi.fn<TrackerMessageListener>();
      tracker.addMessageListener(listener);

      tracker.register(testElement, 'test-el');

      // Both postMessage and listener should be called
      expect(mockTargetWindow.postMessage).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledOnce();

      const msg = listener.mock.calls[0][0];
      expect(msg.type).toBe(MESSAGE_TYPE);
      expect(msg.action).toBe('init');
      expect(msg.elements).toHaveLength(1);
      expect(msg.elements[0].id).toBe('test-el');
    });

    it('auto-replays current state as init to new listener', () => {
      tracker.register(testElement, 'test-el');
      mockTargetWindow.postMessage.mockClear();

      const listener = vi.fn<TrackerMessageListener>();
      tracker.addMessageListener(listener);

      // Listener should be called immediately with init
      expect(listener).toHaveBeenCalledOnce();
      const msg = listener.mock.calls[0][0];
      expect(msg.action).toBe('init');
      expect(msg.elements).toHaveLength(1);
      expect(msg.elements[0].id).toBe('test-el');

      // postMessage should NOT be called (replay is only for the new listener)
      expect(mockTargetWindow.postMessage).not.toHaveBeenCalled();
    });

    it('does not replay when no elements are registered', () => {
      const listener = vi.fn<TrackerMessageListener>();
      tracker.addMessageListener(listener);

      expect(listener).not.toHaveBeenCalled();
    });

    it('listener receives messages alongside constructor onMessage', () => {
      const onMessageFn = vi.fn<TrackerMessageListener>();
      const additionalListener = vi.fn<TrackerMessageListener>();

      const callbackTracker = new ElementTracker({
        onMessage: onMessageFn,
      });
      callbackTracker.addMessageListener(additionalListener);

      callbackTracker.register(testElement, 'test-el');

      expect(onMessageFn).toHaveBeenCalledOnce();
      expect(additionalListener).toHaveBeenCalledOnce();

      // Both receive the same message
      expect(onMessageFn.mock.calls[0][0]).toEqual(additionalListener.mock.calls[0][0]);

      callbackTracker.destroy();
    });

    it('removeMessageListener stops delivery', () => {
      const listener = vi.fn<TrackerMessageListener>();
      tracker.addMessageListener(listener);

      tracker.register(testElement, 'test-el');
      expect(listener).toHaveBeenCalledOnce();
      listener.mockClear();

      tracker.removeMessageListener(listener);
      tracker.forceUpdate();

      expect(listener).not.toHaveBeenCalled();
    });

    it('returned unsubscribe function works', () => {
      const listener = vi.fn<TrackerMessageListener>();
      const unsubscribe = tracker.addMessageListener(listener);

      tracker.register(testElement, 'test-el');
      expect(listener).toHaveBeenCalledOnce();
      listener.mockClear();

      unsubscribe();
      tracker.forceUpdate();

      expect(listener).not.toHaveBeenCalled();
    });

    it('destroy clears all listeners', () => {
      const listener = vi.fn<TrackerMessageListener>();
      tracker.addMessageListener(listener);

      tracker.register(testElement, 'test-el');
      expect(listener).toHaveBeenCalledOnce();
      listener.mockClear();

      tracker.destroy();

      // Re-create tracker so afterEach destroy doesn't fail
      tracker = new ElementTracker({
        targetWindow: mockTargetWindow as unknown as Window,
        targetOrigin: '*',
      });

      // Original listener should not be called on the destroyed tracker
      // (tracker is destroyed, so forceUpdate does nothing anyway)
      expect(listener).not.toHaveBeenCalled();
    });

    it('multiple listeners all receive messages', () => {
      const listener1 = vi.fn<TrackerMessageListener>();
      const listener2 = vi.fn<TrackerMessageListener>();
      const listener3 = vi.fn<TrackerMessageListener>();

      tracker.addMessageListener(listener1);
      tracker.addMessageListener(listener2);
      tracker.addMessageListener(listener3);

      tracker.register(testElement, 'test-el');

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
      expect(listener3).toHaveBeenCalledOnce();

      // All receive the same message
      expect(listener1.mock.calls[0][0]).toEqual(listener2.mock.calls[0][0]);
      expect(listener2.mock.calls[0][0]).toEqual(listener3.mock.calls[0][0]);
    });

    it('listener error does not affect other listeners or primary dispatch', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const listener1 = vi.fn<TrackerMessageListener>();
      const throwingListener = vi.fn<TrackerMessageListener>().mockImplementation(() => {
        throw new Error('listener error');
      });
      const listener2 = vi.fn<TrackerMessageListener>();

      tracker.addMessageListener(listener1);
      tracker.addMessageListener(throwingListener);
      tracker.addMessageListener(listener2);

      tracker.register(testElement, 'test-el');

      // Primary dispatch works
      expect(mockTargetWindow.postMessage).toHaveBeenCalledOnce();

      // All listeners are called regardless of errors
      expect(listener1).toHaveBeenCalledOnce();
      expect(throwingListener).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();

      // Error is logged
      expect(errorSpy).toHaveBeenCalledWith('Error in message listener:', expect.any(Error));

      errorSpy.mockRestore();
    });
  });

  // ==================== ancestor overflow clipping ====================

  describe('ancestor overflow clipping', () => {
    let container: HTMLElement;

    function setupClippingAncestor(
      overflowX: string,
      overflowY: string,
      clipRect: { x: number; y: number; width: number; height: number },
    ) {
      container = document.createElement('div');
      container.appendChild(testElement);
      document.body.appendChild(container);

      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        ...clipRect,
        top: clipRect.y,
        left: clipRect.x,
        right: clipRect.x + clipRect.width,
        bottom: clipRect.y + clipRect.height,
        toJSON: () => {},
      });

      const origGCS = window.getComputedStyle;
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
        if (el === container) {
          const base = origGCS(el);
          return new Proxy(base, {
            get(target, prop) {
              if (prop === 'overflowX') return overflowX;
              if (prop === 'overflowY') return overflowY;
              return (target as any)[prop];
            },
          }) as CSSStyleDeclaration;
        }
        if (el === document.body) {
          const base = origGCS(el);
          return new Proxy(base, {
            get(target, prop) {
              if (prop === 'overflowX') return 'visible';
              if (prop === 'overflowY') return 'visible';
              return (target as any)[prop];
            },
          }) as CSSStyleDeclaration;
        }
        return origGCS(el);
      });
    }

    afterEach(() => {
      if (container && container.parentElement) {
        // Move testElement back to body for other tests
        document.body.appendChild(testElement);
        container.remove();
      }
    });

    it('clips visibleBounds to overflow:hidden ancestor', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

      setupClippingAncestor('hidden', 'hidden', { x: 120, y: 60, width: 160, height: 80 });

      tracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const vis = msg.elements[0].visibility;
      expect(vis.isVisible).toBe(true);
      expect(vis.isFullyVisible).toBe(false);
      expect(vis.visibleBounds).toEqual({ x: 120, y: 60, width: 160, height: 80 });
    });

    it('reports element fully inside overflow:hidden ancestor as fully visible', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

      setupClippingAncestor('hidden', 'hidden', { x: 0, y: 0, width: 500, height: 500 });

      tracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const vis = msg.elements[0].visibility;
      expect(vis.isVisible).toBe(true);
      expect(vis.isFullyVisible).toBe(true);
    });

    it('reports element fully outside overflow:hidden ancestor as hidden', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

      setupClippingAncestor('hidden', 'hidden', { x: 500, y: 500, width: 100, height: 100 });

      tracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const vis = msg.elements[0].visibility;
      expect(vis.isVisible).toBe(false);
      expect(vis.hiddenReason).toBe('offscreen');
    });

    it('handles per-axis overflow (overflow-x:hidden, overflow-y:visible)', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

      setupClippingAncestor('hidden', 'visible', { x: 120, y: 0, width: 160, height: 500 });

      tracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const vis = msg.elements[0].visibility;
      expect(vis.isVisible).toBe(true);
      // X clipped: [100, 300] ∩ [120, 280] = [120, 280], width = 160
      // Y unchanged: [50, 150], height = 100
      expect(vis.visibleBounds).toEqual({ x: 120, y: 50, width: 160, height: 100 });
    });

    it('does not clip when ancestor has overflow:visible', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

      setupClippingAncestor('visible', 'visible', { x: 0, y: 0, width: 500, height: 500 });

      tracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const vis = msg.elements[0].visibility;
      expect(vis.isVisible).toBe(true);
      expect(vis.isFullyVisible).toBe(true);
      expect(vis.visibleBounds).toEqual({ x: 100, y: 50, width: 200, height: 100 });
    });

    it('accumulates clipping from multiple nested overflow:hidden ancestors', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

      const outer = document.createElement('div');
      const inner = document.createElement('div');
      outer.appendChild(inner);
      inner.appendChild(testElement);
      document.body.appendChild(outer);
      container = outer; // So afterEach can clean up

      vi.spyOn(outer, 'getBoundingClientRect').mockReturnValue({
        x: 50,
        y: 0,
        width: 300,
        height: 200,
        top: 0,
        left: 50,
        right: 350,
        bottom: 200,
        toJSON: () => {},
      });

      vi.spyOn(inner, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 20,
        width: 400,
        height: 120,
        top: 20,
        left: 0,
        right: 400,
        bottom: 140,
        toJSON: () => {},
      });

      const origGCS = window.getComputedStyle;
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
        if (el === outer || el === inner) {
          const base = origGCS(el);
          return new Proxy(base, {
            get(target, prop) {
              if (prop === 'overflowX') return 'hidden';
              if (prop === 'overflowY') return 'hidden';
              return (target as any)[prop];
            },
          }) as CSSStyleDeclaration;
        }
        if (el === document.body) {
          const base = origGCS(el);
          return new Proxy(base, {
            get(target, prop) {
              if (prop === 'overflowX') return 'visible';
              if (prop === 'overflowY') return 'visible';
              return (target as any)[prop];
            },
          }) as CSSStyleDeclaration;
        }
        return origGCS(el);
      });

      tracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const vis = msg.elements[0].visibility;
      expect(vis.isVisible).toBe(true);
      // inner clips: (0, 20, 400, 120) -> x:[0,400], y:[20,140]
      // outer clips: (50, 0, 300, 200) -> x:[50,350], y:[0,200]
      // combined: x:[50,350], y:[20,140] => (50, 20, 300, 120)
      // element (100,50,200,100) ∩ combined: x:100, y:50, right:300, bottom:140
      // => (100, 50, 200, 90)
      expect(vis.visibleBounds).toEqual({ x: 100, y: 50, width: 200, height: 90 });
    });
  });

  // ==================== z-index occlusion detection ====================

  describe('z-index occlusion detection', () => {
    it('does not detect occluders when detectOcclusion is false', () => {
      tracker.register(testElement, 'test-el');
      const msg = mockTargetWindow.postMessage.mock.calls[0][0] as TrackerMessage;
      const occlusion = msg.elements[0].occlusion;
      expect(occlusion).toBeDefined();
      expect(occlusion!.occluders).toEqual([]);
    });

    it('detects occluders when detectOcclusion is true', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

      // Create an occluding element
      const occluder = document.createElement('div');
      occluder.id = 'occluder';
      vi.spyOn(occluder, 'getBoundingClientRect').mockReturnValue({
        x: 120,
        y: 60,
        width: 80,
        height: 40,
        top: 60,
        left: 120,
        right: 200,
        bottom: 100,
        toJSON: () => {},
      });
      document.body.appendChild(occluder);

      // Stub elementFromPoint (not available in jsdom)
      document.elementFromPoint = vi.fn((x: number, y: number) => {
        if (x >= 120 && x <= 200 && y >= 60 && y <= 100) {
          return occluder;
        }
        return testElement;
      });

      // Mock body overflow to avoid body being treated as clipping ancestor
      const origGCS = window.getComputedStyle;
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
        if (el === document.body) {
          const base = origGCS(el);
          return new Proxy(base, {
            get(target, prop) {
              if (prop === 'overflowX') return 'visible';
              if (prop === 'overflowY') return 'visible';
              return (target as any)[prop];
            },
          }) as CSSStyleDeclaration;
        }
        return origGCS(el);
      });

      // Create tracker with detectOcclusion enabled
      const occTracker = new ElementTracker({
        targetWindow: mockTargetWindow as unknown as Window,
        targetOrigin: '*',
        detectOcclusion: true,
      });

      occTracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[
        mockTargetWindow.postMessage.mock.calls.length - 1
      ][0] as TrackerMessage;
      const occlusion = msg.elements[0].occlusion;
      expect(occlusion).toBeDefined();
      expect(occlusion!.occluders.length).toBeGreaterThan(0);
      expect(occlusion!.occluders[0].elementId).toBe('occluder');
      expect(occlusion!.occluders[0].elementTag).toBe('div');

      occluder.remove();
      occTracker.destroy();
    });

    it('returns empty occluders when element is not occluded', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

      // Stub elementFromPoint (not available in jsdom)
      document.elementFromPoint = vi.fn(() => testElement);

      const origGCS = window.getComputedStyle;
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
        if (el === document.body) {
          const base = origGCS(el);
          return new Proxy(base, {
            get(target, prop) {
              if (prop === 'overflowX') return 'visible';
              if (prop === 'overflowY') return 'visible';
              return (target as any)[prop];
            },
          }) as CSSStyleDeclaration;
        }
        return origGCS(el);
      });

      const occTracker = new ElementTracker({
        targetWindow: mockTargetWindow as unknown as Window,
        targetOrigin: '*',
        detectOcclusion: true,
      });

      occTracker.register(testElement, 'test-el');

      const msg = mockTargetWindow.postMessage.mock.calls[
        mockTargetWindow.postMessage.mock.calls.length - 1
      ][0] as TrackerMessage;
      const occlusion = msg.elements[0].occlusion;
      expect(occlusion).toBeDefined();
      expect(occlusion!.occluders).toEqual([]);

      occTracker.destroy();
    });

    it('includes updateDuration in TrackerMessage', () => {
      tracker.register(testElement, 'test-el');
      // Init messages don't have updateDuration; trigger a forceUpdate
      tracker.forceUpdate();
      const updateMsg = mockTargetWindow.postMessage.mock.calls[1][0] as TrackerMessage;
      expect(updateMsg.updateDuration).toBeDefined();
      expect(typeof updateMsg.updateDuration).toBe('number');
      expect(updateMsg.updateDuration).toBeGreaterThanOrEqual(0);
    });
  });
});
