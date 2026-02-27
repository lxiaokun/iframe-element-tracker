# iframe-element-tracker - Design Document

## 项目概述

这是一个用于追踪 iframe 内 DOM 元素的 SDK。它允许开发者在 iframe 内部追踪 DOM 元素，并将元素的位置、尺寸、样式等信息同步到宿主页面。基于这些信息，开发者可以实现各种功能，如覆盖层标注、数据分析、自动化测试等。

## 使用前提

**重要**：使用本 SDK 需要开发者同时能够控制宿主页面和 iframe 内容页面的代码（或至少能够向 iframe 页面注入代码），因为需要在两个页面中分别引入 ElementTracker 和 ElementReceiver。

## 核心问题

在 Web 开发中，当需要追踪 iframe 中的元素信息时，会遇到以下挑战：

1. **监控逻辑复杂**：要全面追踪元素变化，需要同时设置 ResizeObserver、IntersectionObserver、滚动监听、窗口 resize 监听等多种机制，代码复杂且容易遗漏。

2. **坐标系统差异**：iframe 内部的坐标系统与宿主页面不同，元素的 `getBoundingClientRect()` 返回的是相对于 iframe 视口的位置，需要转换才能在宿主页面正确使用。

3. **代码耦合**：如果在宿主页面直接访问 iframe DOM 来监听元素变化，会导致两个页面的代码产生较深的耦合，难以维护。

4. **覆盖层边界限制**（仅标注场景）：当需要在宿主页面对 iframe 内的元素进行视觉标注时，如果直接在 iframe 内渲染标注元素，这些元素无法超出 iframe 的矩形边界。通过在宿主页面渲染覆盖层，可以突破这一限制。

## 解决方案架构

### 整体架构

```
┌─────────────────────────────────────────────┐
│          Host Page (宿主页面)                │
│                                             │
│  ┌──────────────────────────────────┐      │
│  │     ElementReceiver (数据层)         │      │
│  │  - 监听 postMessage              │      │
│  │  - 管理元素状态                  │      │
│  │  - 提供事件回调                  │      │
│  └──────────────────────────────────┘      │
│              ↓ events                       │
│  ┌──────────────────────────────────┐      │
│  │   Business Layer (业务层)        │      │
│  │  - 渲染 overlay                  │      │
│  │  - 处理交互                      │      │
│  │  - 自定义样式                    │      │
│  └──────────────────────────────────┘      │
│                                             │
│  ┌───────────────────────────────┐         │
│  │  <iframe>                     │         │
│  │                               │         │
│  │  ┌─────────────────────────┐ │         │
│  │  │  ElementTracker (追踪层)    │ │         │
│  │  │  - 注册元素             │ │         │
│  │  │  - 追踪变化             │ │         │
│  │  │  - 发送 postMessage     │ │         │
│  │  └─────────────────────────┘ │         │
│  │                               │         │
│  └───────────────────────────────┘         │
└─────────────────────────────────────────────┘
```

### 关键设计原则

1. **框架无关**：SDK 只负责数据层，不涉及具体的 UI 框架
2. **职责分离**：追踪、通信、渲染三层分离
3. **类型安全**：使用 TypeScript 提供完整的类型定义
4. **性能优化**：使用高效的浏览器 API（IntersectionObserver, ResizeObserver）
5. **扩展性**：支持自定义 metadata 和灵活的事件系统

## 数据结构设计

### ElementRect 接口

这是 SDK 的核心数据结构，包含了元素的所有追踪信息：

```typescript
interface ElementRect {
  // ===== 基础标识 =====
  id: string; // 元素唯一标识
  timestamp: number; // 最后更新时间戳

  // ===== 位置和尺寸 =====
  bounds: {
    x: number; // 相对于宿主页面的 x 坐标
    y: number; // 相对于宿主页面的 y 坐标
    width: number; // 元素宽度
    height: number; // 元素高度
  };

  // ===== 可见性 =====
  visibility: {
    isVisible: boolean; // 是否在视口中可见
    isFullyVisible: boolean; // 是否完全可见（未被裁剪）
    visibleBounds: {
      // 实际可见区域（被裁剪后）
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    hiddenReason?: 'offscreen' | 'hidden' | 'collapsed' | 'clipped';
  };

  // ===== 样式信息 =====
  styles: {
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
    transform: string | null; // 计算后的 transform matrix
    transformOrigin: string;

    // 裁剪与溢出
    overflow: { x: string; y: string };
    clipPath: string | null;

    // 显示与层叠
    display: string;
    opacity: number;
    zIndex: string; // 'auto' 或数字字符串
    pointerEvents: string;
    position: string;

    // 可选的视觉效果
    outline?: { width: number; offset: number };
    boxShadow?: string;
    filter?: string;
  };

  // ===== 滚动状态（如果元素可滚动）=====
  scroll?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };

  // ===== 用户自定义数据 =====
  metadata?: Record<string, any>;
}

interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
```

### 设计理由

这个数据结构的设计考虑了以下因素：

1. **分组清晰**：将相关属性组织在一起（bounds, visibility, styles 等）
2. **扁平化**：避免过深的嵌套，方便访问
3. **完整性**：包含所有影响元素外观和定位的 CSS 属性
4. **可扩展**：通过 metadata 支持业务自定义数据

## SDK API 设计

### ElementTracker (iframe 内部)

```typescript
class ElementTracker {
  /**
   * 注册需要追踪的元素
   * @param element - DOM 元素或选择器
   * @param options - 配置选项
   */
  register(
    element: HTMLElement | string,
    options?: {
      id?: string; // 自定义 ID
      metadata?: Record<string, any>; // 自定义数据
    },
  ): string;

  /**
   * 取消注册元素
   */
  unregister(id: string): void;

  /**
   * 手动触发更新
   */
  forceUpdate(id?: string): void;

  /**
   * 销毁 SDK 实例
   */
  destroy(): void;
}
```

### ElementReceiver (宿主页面)

```typescript
class ElementReceiver {
  /**
   * 构造函数
   * @param iframe - iframe DOM 元素
   */
  constructor(iframe: HTMLIFrameElement);

  /**
   * 监听事件
   * @param event - 事件类型
   * @param callback - 回调函数
   */
  on(event: 'init', callback: (elements: ElementRect[]) => void): void;
  on(event: 'update', callback: (elements: ElementRect[]) => void): void;
  on(event: 'remove', callback: (elements: { id: string }[]) => void): void;

  /**
   * 取消监听
   */
  off(event: string, callback: Function): void;

  /**
   * 获取所有追踪元素
   */
  getElements(): Map<string, ElementRect>;

  /**
   * 获取单个元素
   */
  getElement(id: string): ElementRect | undefined;

  /**
   * 销毁 SDK 实例
   */
  destroy(): void;
}
```

### 事件系统

ElementReceiver 提供三种事件：

1. **init**: iframe 加载完成后，初始化所有已注册的元素
2. **update**: 元素位置、尺寸、样式发生变化
3. **remove**: 元素被取消注册或从 DOM 中移除

## Demo 设计

### Demo 目标

展示 SDK 的核心能力和不同的 overlay 使用场景：

1. ✅ Overlay 可以跟随 iframe 内元素滚动
2. ✅ 低延迟（流畅的跟随效果）
3. ✅ 元素不可见时自动隐藏 overlay
4. ✅ 响应 iframe 尺寸变化
5. ✅ **标签/工具栏可以超出 iframe 边界显示**

### Overlay 四种形态

#### 1. 透传型 (Passthrough)

- **特点**：`pointer-events: none`，鼠标事件穿透
- **用途**：纯视觉高亮，不影响原有交互
- **样式**：虚线边框，半透明

#### 2. 响应型 (Interactive)

- **特点**：可响应 hover/click 事件
- **用途**：需要捕获用户交互的场景
- **样式**：hover 时改变颜色、显示阴影

#### 3. 标签型 (Labeled)

- **特点**：带文字标签的边框
- **用途**：标识元素、显示元数据
- **样式**：边框 + 顶部标签
- **关键**：**标签可以超出 iframe 边界**

#### 4. 富交互型 (Rich)

- **特点**：带按钮、链接、工具栏的复杂 overlay
- **用途**：需要提供操作按钮的编辑/管理场景
- **样式**：边框 + 底部工具栏
- **关键**：**工具栏可以超出 iframe 边界**

### Demo 页面布局

```html
<!-- host.html -->
<div class="control-panel">
  <!-- 模式切换按钮 -->
  <button id="mode-passthrough" class="active">Passthrough</button>
  <button id="mode-interactive">Interactive</button>
  <button id="mode-labeled">Labeled</button>
  <button id="mode-rich">Rich</button>
</div>

<div class="iframe-wrapper">
  <iframe id="inner-frame" src="./inner.html"></iframe>
  <div class="overlay-container" id="overlay-container"></div>
</div>

<div class="status-panel">
  <!-- 显示当前追踪的元素状态 -->
</div>
```

### Overlay 容器定位策略

为了让 overlay 能够超出 iframe 边界，使用以下 CSS：

```css
.iframe-wrapper {
  position: relative;
  width: 400px;
  height: 500px;
}

.overlay-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 容器本身不响应事件 */
  overflow: visible; /* 允许子元素超出 */
}

.overlay-label {
  position: absolute;
  top: -28px; /* 负值让标签超出上边界 */
  left: -2px;
  pointer-events: auto; /* 标签本身可响应事件 */
}

.overlay-toolbar {
  position: absolute;
  bottom: -36px; /* 负值让工具栏超出下边界 */
  pointer-events: auto;
}
```

## 通信协议

### 消息类型

```typescript
// ElementTracker → ElementReceiver
type TrackerMessage =
  | { type: 'INIT'; elements: ElementRect[] }
  | { type: 'UPDATE'; elements: ElementRect[] }
  | { type: 'REMOVE'; elements: { id: string }[] };

// 可扩展：ElementReceiver → ElementTracker (未来可能需要)
type ReceiverMessage = { type: 'PING' } | { type: 'REQUEST_UPDATE' };
```

### 安全性考虑

1. **源验证**：ElementReceiver 验证 postMessage 来源
2. **消息类型检查**：验证消息格式是否符合协议
3. **错误处理**：优雅处理通信失败和格式错误

## 性能优化策略

### 追踪层优化

1. **批量更新**：使用 requestAnimationFrame 合并多个元素的更新
2. **防抖/节流**：对高频事件（scroll, resize）进行节流
3. **按需追踪**：使用 IntersectionObserver 只追踪可见元素
4. **差量更新**：只发送变化的属性，而非整个对象

### 渲染层优化

1. **CSS Transform**：使用 transform 而非 top/left 提升性能
2. **will-change**：提示浏览器优化动画元素
3. **虚拟化**：大量 overlay 时考虑只渲染可见部分

## 项目结构

```
iframe-overlay/
├── src/
│   ├── shared/
│   │   ├── types.ts           # 类型定义
│   │   ├── constants.ts       # 常量（消息类型等）
│   │   └── utils.ts           # 工具函数
│   ├── tracker/
│   │   └── index.ts           # ElementTracker 实现
│   └── receiver/
│       └── index.ts           # ElementReceiver 实现
├── demo/
│   ├── host.html              # 宿主页面
│   ├── host.ts                # 宿主页面逻辑（含 overlay 渲染）
│   ├── inner.html             # iframe 内页面
│   └── inner.ts               # iframe 内页面逻辑
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 使用示例

### iframe 内部 (inner.html)

```typescript
import { ElementTracker } from '../src/tracker';

const tracker = new ElementTracker();

// 注册元素
tracker.register('#button1', {
  metadata: { label: 'Primary Button' },
});

tracker.register('.card', {
  metadata: { label: 'Card Component' },
});
```

### 宿主页面 (host.html)

```typescript
import { ElementReceiver } from '../src/receiver';

const iframe = document.getElementById('inner-frame');
const receiver = new ElementReceiver(iframe);

// 监听初始化
receiver.on('init', (elements) => {
  elements.forEach((el) => createOverlay(el));
});

// 监听更新
receiver.on('update', (elements) => {
  elements.forEach((el) => updateOverlay(el));
});

// 监听移除
receiver.on('remove', (elements) => {
  elements.forEach((el) => removeOverlay(el.id));
});

function createOverlay(elementRect: ElementRect) {
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.left = `${elementRect.bounds.x}px`;
  overlay.style.top = `${elementRect.bounds.y}px`;
  overlay.style.width = `${elementRect.bounds.width}px`;
  overlay.style.height = `${elementRect.bounds.height}px`;
  overlay.style.border = '2px solid rgba(46, 204, 113, 0.8)';
  overlay.style.pointerEvents = 'none';

  overlayContainer.appendChild(overlay);
}
```

## 未来扩展

1. **双向通信**：宿主页面向 iframe 发送指令
2. **更多追踪信息**：伪元素、Shadow DOM、视频帧内容
3. **性能监控**：内置性能指标收集
4. **调试工具**：开发者工具插件，可视化追踪状态
5. **预设模板**：提供常见 overlay 样式的预设

## 总结

这个 SDK 通过清晰的职责分离和框架无关的设计，提供了一个灵活、高性能的 iframe 元素追踪和标注解决方案。核心价值在于：

1. ✅ 解决了跨 iframe 的元素定位问题
2. ✅ 提供了完整的元素信息（位置、样式、可见性）
3. ✅ 支持 overlay 超出 iframe 边界
4. ✅ 保持了框架无关性，业务层可自由选择技术栈
5. ✅ 高性能的追踪机制，适合实时场景
