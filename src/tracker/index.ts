import {
  ElementRect,
  ElementStyles,
  ElementVisibility,
  Bounds,
  Spacing,
  OverlayMessage,
  MESSAGE_TYPE,
  DEFAULT_THROTTLE_DELAY,
} from '../shared';

/**
 * 注册元素的选项
 */
export interface RegisterOptions {
  /** 用户自定义数据 */
  metadata?: Record<string, unknown>;
}

/**
 * TrackerSDK 配置选项
 */
export interface TrackerOptions {
  /** 目标窗口，默认为 window.parent */
  targetWindow?: Window;
  /** 目标 origin，默认为 '*' */
  targetOrigin?: string;
  /** 节流延迟（毫秒），默认 16ms */
  throttleDelay?: number;
}

/**
 * 被追踪元素的内部记录
 */
interface TrackedElement {
  element: Element;
  id: string;
  metadata?: Record<string, unknown>;
  lastRect: ElementRect | null;
}

/**
 * TrackerSDK - 在 iframe 内页面中使用
 * 用于注册和追踪 DOM 元素的位置、尺寸和样式变化
 */
export class TrackerSDK {
  private trackedElements: Map<string, TrackedElement> = new Map();
  private targetWindow: Window;
  private targetOrigin: string;
  private throttleDelay: number;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private scrollHandler: () => void;
  private resizeHandler: () => void;
  private pendingUpdate: number | null = null;
  private isDestroyed = false;

  constructor(options: TrackerOptions = {}) {
    this.targetWindow = options.targetWindow ?? window.parent;
    this.targetOrigin = options.targetOrigin ?? '*';
    this.throttleDelay = options.throttleDelay ?? DEFAULT_THROTTLE_DELAY;

    // 创建 ResizeObserver 监听元素尺寸变化
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleUpdate();
    });

    // 创建 IntersectionObserver 监听元素可见性变化
    this.intersectionObserver = new IntersectionObserver(
      () => {
        this.scheduleUpdate();
      },
      {
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
      }
    );

    // 滚动事件处理
    this.scrollHandler = () => {
      this.scheduleUpdate();
    };

    // 窗口 resize 事件处理
    this.resizeHandler = () => {
      this.scheduleUpdate();
    };

    // 绑定事件
    window.addEventListener('scroll', this.scrollHandler, { passive: true, capture: true });
    window.addEventListener('resize', this.resizeHandler, { passive: true });
  }

  /**
   * 注册一个元素进行追踪
   */
  register(element: Element, id: string, options: RegisterOptions = {}): void {
    if (this.isDestroyed) {
      console.warn('TrackerSDK has been destroyed');
      return;
    }

    if (this.trackedElements.has(id)) {
      console.warn(`Element with id "${id}" is already registered`);
      return;
    }

    const tracked: TrackedElement = {
      element,
      id,
      metadata: options.metadata,
      lastRect: null,
    };

    this.trackedElements.set(id, tracked);
    this.resizeObserver.observe(element);
    this.intersectionObserver.observe(element);

    // 立即发送初始状态
    this.sendUpdate('init', [this.getElementRect(tracked)]);
  }

  /**
   * 取消注册一个元素
   */
  unregister(id: string): void {
    const tracked = this.trackedElements.get(id);
    if (!tracked) {
      return;
    }

    this.resizeObserver.unobserve(tracked.element);
    this.intersectionObserver.unobserve(tracked.element);
    this.trackedElements.delete(id);

    // 发送移除通知
    this.sendUpdate('remove', [{ id } as ElementRect]);
  }

  /**
   * 更新元素的 metadata
   */
  updateMetadata(id: string, metadata: Record<string, unknown>): void {
    const tracked = this.trackedElements.get(id);
    if (!tracked) {
      return;
    }

    tracked.metadata = { ...tracked.metadata, ...metadata };
    this.scheduleUpdate();
  }

  /**
   * 手动触发更新
   */
  forceUpdate(): void {
    this.performUpdate();
  }

  /**
   * 销毁 SDK，清理所有资源
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    if (this.pendingUpdate !== null) {
      cancelAnimationFrame(this.pendingUpdate);
    }

    window.removeEventListener('scroll', this.scrollHandler, { capture: true });
    window.removeEventListener('resize', this.resizeHandler);

    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.trackedElements.clear();
  }

  /**
   * 调度一次更新（节流）
   */
  private scheduleUpdate(): void {
    if (this.pendingUpdate !== null || this.isDestroyed) {
      return;
    }

    this.pendingUpdate = requestAnimationFrame(() => {
      this.pendingUpdate = null;
      this.performUpdate();
    });
  }

  /**
   * 执行更新，计算所有元素的最新状态并发送
   */
  private performUpdate(): void {
    if (this.isDestroyed || this.trackedElements.size === 0) {
      return;
    }

    const elements: ElementRect[] = [];

    for (const tracked of this.trackedElements.values()) {
      const rect = this.getElementRect(tracked);
      tracked.lastRect = rect;
      elements.push(rect);
    }

    this.sendUpdate('update', elements);
  }

  /**
   * 获取元素的完整信息
   */
  private getElementRect(tracked: TrackedElement): ElementRect {
    const { element, id, metadata } = tracked;
    const domRect = element.getBoundingClientRect();
    const computedStyle = getComputedStyle(element);

    const bounds: Bounds = {
      x: domRect.x,
      y: domRect.y,
      width: domRect.width,
      height: domRect.height,
    };

    const visibility = this.getVisibility(element, domRect);
    const styles = this.getStyles(computedStyle);
    const scroll = this.getScroll(element);

    return {
      id,
      timestamp: Date.now(),
      bounds,
      visibility,
      styles,
      scroll,
      metadata,
    };
  }

  /**
   * 获取元素可见性信息
   */
  private getVisibility(element: Element, domRect: DOMRect): ElementVisibility {
    const computedStyle = getComputedStyle(element);

    // 检查 display: none 或 visibility: hidden
    if (computedStyle.display === 'none') {
      return {
        isVisible: false,
        isFullyVisible: false,
        visibleBounds: null,
        hiddenReason: 'hidden',
      };
    }

    if (computedStyle.visibility === 'hidden') {
      return {
        isVisible: false,
        isFullyVisible: false,
        visibleBounds: null,
        hiddenReason: 'hidden',
      };
    }

    // 检查尺寸是否为 0
    if (domRect.width === 0 || domRect.height === 0) {
      return {
        isVisible: false,
        isFullyVisible: false,
        visibleBounds: null,
        hiddenReason: 'collapsed',
      };
    }

    // 计算与视口的交集
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const visibleX = Math.max(0, domRect.x);
    const visibleY = Math.max(0, domRect.y);
    const visibleRight = Math.min(viewportWidth, domRect.x + domRect.width);
    const visibleBottom = Math.min(viewportHeight, domRect.y + domRect.height);

    const visibleWidth = Math.max(0, visibleRight - visibleX);
    const visibleHeight = Math.max(0, visibleBottom - visibleY);

    // 完全在视口外
    if (visibleWidth === 0 || visibleHeight === 0) {
      return {
        isVisible: false,
        isFullyVisible: false,
        visibleBounds: null,
        hiddenReason: 'offscreen',
      };
    }

    const isFullyVisible =
      domRect.x >= 0 &&
      domRect.y >= 0 &&
      domRect.x + domRect.width <= viewportWidth &&
      domRect.y + domRect.height <= viewportHeight;

    return {
      isVisible: true,
      isFullyVisible,
      visibleBounds: {
        x: visibleX,
        y: visibleY,
        width: visibleWidth,
        height: visibleHeight,
      },
      hiddenReason: isFullyVisible ? undefined : 'clipped',
    };
  }

  /**
   * 获取元素样式信息
   */
  private getStyles(style: CSSStyleDeclaration): ElementStyles {
    return {
      boxSizing: style.boxSizing as 'content-box' | 'border-box',
      padding: this.parseSpacing(style, 'padding'),
      margin: this.parseSpacing(style, 'margin'),
      border: {
        width: {
          top: parseFloat(style.borderTopWidth) || 0,
          right: parseFloat(style.borderRightWidth) || 0,
          bottom: parseFloat(style.borderBottomWidth) || 0,
          left: parseFloat(style.borderLeftWidth) || 0,
        },
        radius: {
          topLeft: style.borderTopLeftRadius,
          topRight: style.borderTopRightRadius,
          bottomRight: style.borderBottomRightRadius,
          bottomLeft: style.borderBottomLeftRadius,
        },
      },
      transform: style.transform === 'none' ? null : style.transform,
      transformOrigin: style.transformOrigin,
      overflow: {
        x: style.overflowX,
        y: style.overflowY,
      },
      clipPath: style.clipPath === 'none' ? null : style.clipPath,
      display: style.display,
      opacity: parseFloat(style.opacity) || 1,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      position: style.position,
      outline: {
        width: parseFloat(style.outlineWidth) || 0,
        offset: parseFloat(style.outlineOffset) || 0,
      },
      boxShadow: style.boxShadow === 'none' ? undefined : style.boxShadow,
      filter: style.filter === 'none' ? undefined : style.filter,
    };
  }

  /**
   * 解析间距属性
   */
  private parseSpacing(
    style: CSSStyleDeclaration,
    property: 'padding' | 'margin'
  ): Spacing {
    return {
      top: parseFloat(style.getPropertyValue(`${property}-top`)) || 0,
      right: parseFloat(style.getPropertyValue(`${property}-right`)) || 0,
      bottom: parseFloat(style.getPropertyValue(`${property}-bottom`)) || 0,
      left: parseFloat(style.getPropertyValue(`${property}-left`)) || 0,
    };
  }

  /**
   * 获取元素滚动状态
   */
  private getScroll(element: Element): ElementRect['scroll'] | undefined {
    if (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight) {
      return {
        top: element.scrollTop,
        left: element.scrollLeft,
        width: element.scrollWidth,
        height: element.scrollHeight,
      };
    }
    return undefined;
  }

  /**
   * 发送更新消息到宿主页面
   */
  private sendUpdate(action: OverlayMessage['action'], elements: ElementRect[]): void {
    const message: OverlayMessage = {
      type: MESSAGE_TYPE,
      action,
      elements,
    };

    try {
      this.targetWindow.postMessage(message, this.targetOrigin);
    } catch (error) {
      console.error('Failed to send message to parent window:', error);
    }
  }
}

export default TrackerSDK;
