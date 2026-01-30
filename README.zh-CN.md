# iframe-element-tracker

用于追踪 iframe 内 DOM 元素并将其位置、尺寸、样式等信息同步到宿主页面的 SDK。

[English](./README.md)

## 使用前提

**重要**：使用本 SDK 需要开发者同时能够控制宿主页面和 iframe 内容页面的代码（或至少能够向 iframe 页面注入代码），因为需要在两个页面中分别引入 TrackerSDK 和 ReceiverSDK。

## 为什么需要这个 SDK？

### 简单注册，自动追踪

只需注册你关注的元素，SDK 会自动追踪所有变化：

```typescript
// 在 iframe 内只需这一行
tracker.register(element, 'my-element');
```

无需手动设置 ResizeObserver、IntersectionObserver、滚动监听等复杂的监控逻辑。

### 全面的变化检测

SDK 自动监控并上报：
- 位置变化（滚动、布局偏移）
- 尺寸变化（resize、内容变化）
- 可见性变化（进出视口、CSS 隐藏）
- 样式变化（transform、border-radius、opacity 等）

### 事件驱动的 API

宿主页面通过简洁的事件接口接收通知，轻松响应变化：

```typescript
receiver.on('update', (elements) => {
  // 响应元素变化
});
```

### 解耦的架构

宿主页面和 iframe 页面仅通过 postMessage 进行事件和数据通信，保持代码独立、易于维护。

### 覆盖层可超出边界

当需要对 iframe 内的元素进行标注时，如果直接在 iframe 内渲染标注，标注元素无法超出 iframe 的边界。通过在宿主页面追踪元素并渲染覆盖层，标签、工具栏等 UI 元素可以自由地延伸到 iframe 矩形区域之外。

## 特性

- **实时追踪**：实时追踪元素的位置、尺寸和样式变化
- **跨 iframe 通信**：通过 postMessage 实现 iframe 与宿主页面的无缝通信
- **丰富的元素信息**：包含边界、可见性、CSS 样式、变换等完整数据
- **框架无关**：纯数据层 SDK，不依赖任何 UI 框架
- **高性能**：基于 ResizeObserver、IntersectionObserver 优化，高效的更新批处理
- **TypeScript 支持**：包含完整的类型定义

## 安装

```bash
npm install iframe-element-tracker
```

## 快速开始

### iframe 内部 (TrackerSDK)

```typescript
import { TrackerSDK } from 'iframe-element-tracker';

const tracker = new TrackerSDK();

// 注册需要追踪的元素
tracker.register(document.getElementById('my-element'), 'my-element', {
  metadata: { label: '我的元素' }
});

// 取消注册
tracker.unregister('my-element');

// 销毁清理
tracker.destroy();
```

### 宿主页面 (ReceiverSDK)

```typescript
import { ReceiverSDK } from 'iframe-element-tracker';

const iframe = document.getElementById('my-iframe') as HTMLIFrameElement;
const receiver = new ReceiverSDK(iframe);

// 监听元素初始化
receiver.on('init', (elements) => {
  elements.forEach(el => {
    console.log(`元素 ${el.id} 初始化于 (${el.bounds.x}, ${el.bounds.y})`);
  });
});

// 监听元素更新
receiver.on('update', (elements) => {
  elements.forEach(el => {
    console.log(`元素 ${el.id} 移动到 (${el.bounds.x}, ${el.bounds.y})`);
  });
});

// 监听元素移除
receiver.on('remove', (elements) => {
  elements.forEach(el => {
    console.log(`元素 ${el.id} 已移除`);
  });
});

// 获取当前元素数据
const allElements = receiver.getElements();
const singleElement = receiver.getElement('my-element');

// 销毁清理
receiver.destroy();
```

## API 参考

### TrackerSDK

TrackerSDK 运行在 iframe 内部，负责追踪已注册的 DOM 元素。

#### 构造函数

```typescript
new TrackerSDK(options?: TrackerOptions)
```

**配置项：**
- `targetWindow?: Window` - postMessage 的目标窗口（默认：`window.parent`）
- `targetOrigin?: string` - postMessage 的目标 origin（默认：`'*'`）

#### 方法

| 方法 | 描述 |
|------|------|
| `register(element, id, options?)` | 注册元素进行追踪 |
| `unregister(id)` | 停止追踪元素 |
| `updateMetadata(id, metadata)` | 更新元素的 metadata |
| `forceUpdate()` | 手动触发更新 |
| `destroy()` | 清理所有资源 |

### ReceiverSDK

ReceiverSDK 运行在宿主页面，接收来自 iframe 的元素数据。

#### 构造函数

```typescript
new ReceiverSDK(iframe: HTMLIFrameElement, options?: ReceiverOptions)
```

**配置项：**
- `allowedOrigin?: string` - 允许的消息来源（默认：`'*'`）

#### 方法

| 方法 | 描述 |
|------|------|
| `on(event, callback)` | 监听事件（'init'、'update'、'remove'） |
| `off(event, callback)` | 移除事件监听 |
| `getElements()` | 获取所有追踪的元素 |
| `getElement(id)` | 根据 ID 获取单个元素 |
| `getIframe()` | 获取绑定的 iframe 元素 |
| `getIframeBounds()` | 获取 iframe 的边界矩形 |
| `destroy()` | 清理所有资源 |

### ElementRect

追踪元素的数据结构：

```typescript
interface ElementRect {
  id: string;                    // 唯一追踪标识符
  timestamp: number;             // 最后更新时间戳

  attributes: {
    elementId: string;           // 元素的 id 属性
    classList: string[];         // 元素的 class 列表
    dataset: Record<string, string>; // 元素的 data-* 属性
  };

  bounds: {
    x: number;                   // 相对于 iframe 视口的 X 位置
    y: number;                   // 相对于 iframe 视口的 Y 位置
    width: number;               // 元素宽度
    height: number;              // 元素高度
  };

  visibility: {
    isVisible: boolean;          // 元素是否在视口中可见
    isFullyVisible: boolean;     // 元素是否完全可见
    visibleBounds: {...} | null; // 可见部分的边界
    hiddenReason?: string;       // 隐藏原因
  };

  styles: {
    boxSizing: string;
    padding: Spacing;
    margin: Spacing;
    border: {...};
    transform: string | null;
    transformOrigin: string;
    overflow: { x: string; y: string };
    opacity: number;
    // ... 更多 CSS 属性
  };

  scroll?: {...};                // 滚动状态（如果可滚动）
  metadata?: Record<string, any>; // 用户自定义数据
}
```

## 使用场景

- **覆盖层标注**：在 iframe 元素上渲染高亮、标签或工具栏
- **视觉测试**：追踪元素位置用于视觉回归测试
- **数据分析**：监控用户与特定元素的交互
- **无障碍工具**：构建无障碍覆盖层和辅助工具
- **设计工具**：创建跨 iframe 边界工作的可视化编辑器

## 演示

运行 demo 查看 SDK 效果：

```bash
npm install
npm run dev
```

然后打开 http://localhost:3000/demo/host.html

## 浏览器支持

- Chrome 64+
- Firefox 69+
- Safari 14+
- Edge 79+

## 许可证

MIT
