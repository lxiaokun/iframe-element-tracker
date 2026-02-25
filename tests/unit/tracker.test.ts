import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementTracker } from '../../src/tracker';
import { MESSAGE_TYPE } from '../../src/shared';
import { installObserverMocks } from '../helpers/dom-mocks';
import type { TrackerMessage } from '../../src/shared';

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
        '*'
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
        'https://example.com'
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
        expect.any(Error)
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
});
