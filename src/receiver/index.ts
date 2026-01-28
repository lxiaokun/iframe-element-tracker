import {
  ElementRect,
  OverlayMessage,
  MessageAction,
  MESSAGE_TYPE,
} from '../shared';

/**
 * 事件回调类型
 */
export type EventCallback = (elements: ElementRect[]) => void;

/**
 * ReceiverSDK 配置选项
 */
export interface ReceiverOptions {
  /** 允许的 origin，默认为 '*'（接受所有来源） */
  allowedOrigin?: string;
}

/**
 * ReceiverSDK - 在宿主页面中使用
 * 用于接收 iframe 内页面发送的元素追踪信息
 */
export class ReceiverSDK {
  private iframe: HTMLIFrameElement;
  private allowedOrigin: string;
  private elements: Map<string, ElementRect> = new Map();
  private listeners: Map<MessageAction, Set<EventCallback>> = new Map();
  private messageHandler: (event: MessageEvent) => void;
  private isDestroyed = false;

  constructor(iframe: HTMLIFrameElement, options: ReceiverOptions = {}) {
    this.iframe = iframe;
    this.allowedOrigin = options.allowedOrigin ?? '*';

    // 初始化事件监听器集合
    this.listeners.set('init', new Set());
    this.listeners.set('update', new Set());
    this.listeners.set('remove', new Set());

    // 消息处理函数
    this.messageHandler = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    // 监听 message 事件
    window.addEventListener('message', this.messageHandler);
  }

  /**
   * 监听事件
   */
  on(event: MessageAction, callback: EventCallback): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.add(callback);
    }
  }

  /**
   * 移除事件监听
   */
  off(event: MessageAction, callback: EventCallback): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * 获取所有当前追踪的元素
   */
  getElements(): Map<string, ElementRect> {
    return new Map(this.elements);
  }

  /**
   * 获取单个元素
   */
  getElement(id: string): ElementRect | undefined {
    return this.elements.get(id);
  }

  /**
   * 获取绑定的 iframe 元素
   */
  getIframe(): HTMLIFrameElement {
    return this.iframe;
  }

  /**
   * 获取 iframe 在宿主页面中的位置
   */
  getIframeBounds(): DOMRect {
    return this.iframe.getBoundingClientRect();
  }

  /**
   * 将 iframe 内的坐标转换为宿主页面的坐标
   */
  transformToHostCoordinates(
    iframeX: number,
    iframeY: number
  ): { x: number; y: number } {
    const iframeBounds = this.getIframeBounds();
    return {
      x: iframeBounds.x + iframeX,
      y: iframeBounds.y + iframeY,
    };
  }

  /**
   * 获取元素在宿主页面中的边界
   */
  getElementHostBounds(id: string): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    const element = this.elements.get(id);
    if (!element) {
      return null;
    }

    const hostCoords = this.transformToHostCoordinates(
      element.bounds.x,
      element.bounds.y
    );

    return {
      x: hostCoords.x,
      y: hostCoords.y,
      width: element.bounds.width,
      height: element.bounds.height,
    };
  }

  /**
   * 销毁 SDK，清理所有资源
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    window.removeEventListener('message', this.messageHandler);
    this.elements.clear();
    this.listeners.clear();
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(event: MessageEvent): void {
    if (this.isDestroyed) {
      return;
    }

    // 验证来源
    if (this.allowedOrigin !== '*' && event.origin !== this.allowedOrigin) {
      return;
    }

    // 验证消息来源是否是绑定的 iframe
    if (event.source !== this.iframe.contentWindow) {
      return;
    }

    // 验证消息格式
    const message = event.data as OverlayMessage;
    if (!message || message.type !== MESSAGE_TYPE) {
      return;
    }

    // 处理不同的动作
    switch (message.action) {
      case 'init':
        this.handleInit(message.elements);
        break;
      case 'update':
        this.handleUpdate(message.elements);
        break;
      case 'remove':
        this.handleRemove(message.elements);
        break;
    }
  }

  /**
   * 处理初始化消息
   */
  private handleInit(elements: ElementRect[]): void {
    for (const element of elements) {
      this.elements.set(element.id, element);
    }
    this.emit('init', elements);
  }

  /**
   * 处理更新消息
   */
  private handleUpdate(elements: ElementRect[]): void {
    for (const element of elements) {
      this.elements.set(element.id, element);
    }
    this.emit('update', elements);
  }

  /**
   * 处理移除消息
   */
  private handleRemove(elements: ElementRect[]): void {
    const removed: ElementRect[] = [];
    for (const element of elements) {
      const existing = this.elements.get(element.id);
      if (existing) {
        removed.push(existing);
        this.elements.delete(element.id);
      }
    }
    if (removed.length > 0) {
      this.emit('remove', removed);
    }
  }

  /**
   * 触发事件
   */
  private emit(event: MessageAction, elements: ElementRect[]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(elements);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      }
    }
  }
}

export default ReceiverSDK;
