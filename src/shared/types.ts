/**
 * 间距类型，用于 padding, margin, border-width
 */
export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * 矩形边界
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 元素可见性信息
 */
export interface ElementVisibility {
  /** 元素是否在视口中可见 */
  isVisible: boolean;
  /** 是否完全可见（未被裁剪） */
  isFullyVisible: boolean;
  /** 实际可见区域（被裁剪后），不可见时为 null */
  visibleBounds: Bounds | null;
  /** 不可见的原因 */
  hiddenReason?: 'offscreen' | 'hidden' | 'collapsed' | 'clipped';
}

/**
 * 元素样式信息
 */
export interface ElementStyles {
  // 盒模型
  boxSizing: 'content-box' | 'border-box';
  padding: Spacing;
  margin: Spacing;
  border: {
    width: Spacing;
    radius: {
      topLeft: string;
      topRight: string;
      bottomRight: string;
      bottomLeft: string;
    };
  };

  // 变换
  transform: string | null;
  transformOrigin: string;

  // 裁剪与溢出
  overflow: { x: string; y: string };
  clipPath: string | null;

  // 显示与层叠
  display: string;
  opacity: number;
  zIndex: string;
  pointerEvents: string;
  position: string;

  // 可选的视觉效果
  outline?: { width: number; offset: number };
  boxShadow?: string;
  filter?: string;
}

/**
 * 元素滚动状态
 */
export interface ElementScroll {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * 被追踪元素的完整信息
 */
export interface ElementRect {
  /** 元素唯一标识 */
  id: string;
  /** 更新时间戳 */
  timestamp: number;
  /** 位置和尺寸（来自 getBoundingClientRect） */
  bounds: Bounds;
  /** 可见性信息 */
  visibility: ElementVisibility;
  /** CSS 样式信息 */
  styles: ElementStyles;
  /** 滚动状态（如果元素可滚动） */
  scroll?: ElementScroll;
  /** 用户自定义数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 消息动作类型
 */
export type MessageAction = 'init' | 'update' | 'remove';

/**
 * iframe 到宿主页面的消息结构
 */
export interface OverlayMessage {
  /** 消息类型标识 */
  type: string;
  /** 动作类型 */
  action: MessageAction;
  /** 元素信息列表 */
  elements: ElementRect[];
}
