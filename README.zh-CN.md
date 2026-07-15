# iframe-element-tracker

[![npm version](https://img.shields.io/npm/v/iframe-element-tracker.svg)](https://www.npmjs.com/package/iframe-element-tracker)
[![npm downloads](https://img.shields.io/npm/dm/iframe-element-tracker.svg)](https://www.npmjs.com/package/iframe-element-tracker)
[![license](https://img.shields.io/npm/l/iframe-element-tracker.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/iframe-element-tracker.svg)](https://www.npmjs.com/package/iframe-element-tracker)

用于追踪 iframe 内 DOM 元素并将其位置、尺寸、样式等信息同步到宿主页面的 SDK。

[English](./README.md) · [GitHub](https://github.com/lxiaokun/iframe-element-tracker) · [Issues](https://github.com/lxiaokun/iframe-element-tracker/issues)

## 使用前提

**重要**：使用本 SDK 需要开发者同时能够控制宿主页面和 iframe 内容页面的代码（或至少能够向 iframe 页面注入代码），因为需要在两个页面中分别引入 ElementTracker 和 ElementReceiver。

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
- **遮挡检测**：检测祖先元素 overflow 裁剪和 z-index 遮挡，自动生成覆盖层 clip-path
- **TypeScript 支持**：包含完整的类型定义

## 安装

```bash
npm install iframe-element-tracker
```

## 快速开始

### iframe 内部 (ElementTracker)

```typescript
import { ElementTracker } from 'iframe-element-tracker';

const tracker = new ElementTracker();

// 注册需要追踪的元素
tracker.register(document.getElementById('my-element'), 'my-element', {
  metadata: { label: '我的元素' },
});

// 取消注册
tracker.unregister('my-element');

// 销毁清理
tracker.destroy();
```

### 宿主页面 (ElementReceiver)

```typescript
import { ElementReceiver } from 'iframe-element-tracker';

const iframe = document.getElementById('my-iframe') as HTMLIFrameElement;
const receiver = new ElementReceiver(iframe);

// 监听元素初始化
receiver.on('init', (elements) => {
  elements.forEach((el) => {
    console.log(`元素 ${el.id} 初始化于 (${el.bounds.x}, ${el.bounds.y})`);
  });
});

// 监听元素更新
receiver.on('update', (elements) => {
  elements.forEach((el) => {
    console.log(`元素 ${el.id} 移动到 (${el.bounds.x}, ${el.bounds.y})`);
  });
});

// 监听元素移除
receiver.on('remove', (elements) => {
  elements.forEach((el) => {
    console.log(`元素 ${el.id} 已移除`);
  });
});

// 获取当前元素数据
const allElements = receiver.getElements();
const singleElement = receiver.getElement('my-element');

// 销毁清理
receiver.destroy();
```

### 渲染覆盖层 (OverlayPositioner)

在宿主页面渲染覆盖层时，需要将 iframe 坐标转换为宿主页面坐标。`OverlayPositioner` 自动处理所有复杂的坐标变换，包括：

- iframe 的 margin、border、padding
- iframe 或祖先元素的 CSS `transform: scale()`
- iframe 或祖先元素的 CSS `zoom`
- 覆盖层容器偏移（当容器超出 iframe 边界时）

```typescript
import { ElementReceiver, OverlayPositioner } from 'iframe-element-tracker';

const iframe = document.getElementById('my-iframe') as HTMLIFrameElement;
const overlayContainer = document.getElementById('overlay-container');

const receiver = new ElementReceiver(iframe);
const positioner = new OverlayPositioner({ iframe, container: overlayContainer });

// 简单用法：直接将样式应用到覆盖层元素
receiver.on('update', (elements) => {
  elements.forEach((el) => {
    const overlay = getOrCreateOverlay(el.id);
    positioner.applyOverlayStyle(overlay, el);
  });
});

// 或获取样式值手动应用
receiver.on('update', (elements) => {
  elements.forEach((el) => {
    const style = positioner.getOverlayStyle(el);
    if (style) {
      overlay.style.left = `${style.left}px`;
      overlay.style.top = `${style.top}px`;
      overlay.style.width = `${style.width}px`;
      overlay.style.height = `${style.height}px`;
      overlay.style.borderRadius = style.borderRadius;
    }
  });
});
```

#### 进阶：底层 API

对于自定义计算或优化场景，可以访问底层方法：

```typescript
// 获取所有缩放和偏移值
const context = positioner.getScaleContext();
// 返回: { iframeScale, iframeZoom, iframeTransform, iframeTranslate, ancestorScale,
//         combinedScale, iframeMargin, iframeBorderPadding, containerOffset }

// 手动转换坐标
const position = positioner.transformCoordinates(bounds.x, bounds.y, context);

// 手动转换尺寸
const dimensions = positioner.transformDimensions(bounds.width, bounds.height, context);

// 缩放 border-radius
const borderRadius = positioner.scaleBorderRadius(styles.border.radius, context.iframeScale.scaleX);
```

### 遮挡检测

ElementTracker 会自动检测被追踪元素是否被祖先元素的 `overflow:hidden/auto/scroll` 容器裁剪。`visibility.visibleBounds` 字段会考虑祖先元素的 overflow 裁剪（按轴独立检测 `overflow-x` 和 `overflow-y`）。

如需检测 z-index 遮挡（检测覆盖在被追踪元素上方的其他元素），启用 `detectOcclusion` 选项：

```typescript
// 全局启用 z-index 遮挡检测
const tracker = new ElementTracker({
  detectOcclusion: true,
});

// 或按元素启用
tracker.register(element, 'my-element', {
  detectOcclusion: true,
});
```

启用遮挡检测后，每个 `ElementRect` 会包含 `occlusion` 字段，提供裁剪边界和遮挡元素信息。

在宿主页面端，`OverlayPositioner` 会根据遮挡数据自动为覆盖层应用 `clip-path`：

- overflow 裁剪 → `clip-path: inset(...)`，未裁剪方向使用负边距
- z-index 遮挡 → `clip-path: path(evenodd, ...)`，为遮挡元素留出镂空区域

```typescript
const positioner = new OverlayPositioner({
  iframe,
  container: overlayContainer,
  clipOverflowMargin: 100, // 未裁剪方向的边距（px）（默认：100）
});

// applyOverlayStyle() 会自动应用 clip-path
positioner.applyOverlayStyle(overlay, elementRect);

// 或手动获取 clip-path 值
const style = positioner.getOverlayStyle(elementRect);
if (style?.clipPath) {
  overlay.style.clipPath = style.clipPath;
}
```

## 同页面追踪

除了跨 iframe 追踪模式外，SDK 还支持**同页面追踪**——直接在被追踪元素所在的同一页面中渲染覆盖层标注，无需 iframe。

当你需要在当前页面内对元素进行标注，或者需要宿主页面覆盖层和内页覆盖层同时显示时，此模式非常有用。

### 工作原理

1. 正常创建 `ElementTracker`（通过 `postMessage` 发送，或使用 `onMessage` 回调）
2. 创建不带 iframe 的 `ElementReceiver`（传入 `null`）
3. 使用 `addMessageListener` 订阅 receiver——监听器会自动收到当前状态的 `init` 消息

```typescript
import { ElementTracker } from 'iframe-element-tracker';
import { ElementReceiver } from 'iframe-element-tracker';

const tracker = new ElementTracker();

// 注册需要追踪的元素
tracker.register(document.getElementById('my-element')!, 'my-element');

// 之后，当需要同页覆盖层时：
const receiver = new ElementReceiver(null);

receiver.on('init', (elements) => {
  elements.forEach((el) => {
    const overlay = createOverlay(el.id);
    // 使用文档坐标（配合 absolute 定位的覆盖层容器）
    overlay.style.left = `${el.bounds.x + window.scrollX}px`;
    overlay.style.top = `${el.bounds.y + window.scrollY}px`;
    overlay.style.width = `${el.bounds.width}px`;
    overlay.style.height = `${el.bounds.height}px`;
  });
});

receiver.on('update', (elements) => {
  elements.forEach((el) => updateOverlayPosition(el));
});

// 订阅——自动回放当前状态
const unsubscribe = tracker.addMessageListener((msg) => receiver.handleTrackerMessage(msg));

// 停止时：
unsubscribe();
receiver.destroy();
```

### 覆盖层容器设置

同页模式下，使用 `absolute` 定位的容器，这样 body 级别的滚动由浏览器合成层处理（零延迟滚动同步）：

```html
<div
  id="overlay-container"
  style="
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  min-height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 9999;
"
></div>
```

### 与跨 iframe 模式共存

一个 tracker 可以同时向跨 iframe 的 receiver（通过 postMessage）和同页 receiver（通过 `addMessageListener`）发送消息：

```typescript
// 单个 tracker 通过 postMessage 发送到宿主页面
const tracker = new ElementTracker();
tracker.register(element, 'my-element');

// 在 postMessage 派发之外，添加同页 receiver
const localReceiver = new ElementReceiver(null);
const unsubscribe = tracker.addMessageListener((msg) => localReceiver.handleTrackerMessage(msg));
// localReceiver 自动接收当前状态

// 停止同页覆盖层：
unsubscribe();
localReceiver.destroy();
```

## API 参考

### ElementTracker

ElementTracker 运行在 iframe 内部，负责追踪已注册的 DOM 元素。

#### 构造函数

```typescript
new ElementTracker(options?: TrackerOptions)
```

**配置项：**

- `targetWindow?: Window` - postMessage 的目标窗口（默认：`window.parent`）
- `targetOrigin?: string` - postMessage 的目标 origin（默认：`'*'`）
- `onMessage?: (message: TrackerMessage) => void` - 直接消息回调；设置后跳过 postMessage
- `scrollContainer?: HTMLElement` - 滚动容器元素；设置后上报该元素的滚动状态而非 window 的，并将滚动事件绑定到该元素
- `detectOcclusion?: boolean` - 全局启用 z-index 遮挡检测（默认：`false`）

#### 方法

| 方法                              | 描述                                                 |
| --------------------------------- | ---------------------------------------------------- |
| `register(element, id, options?)` | 注册元素进行追踪                                     |
| `unregister(id)`                  | 停止追踪元素                                         |
| `updateMetadata(id, metadata)`    | 更新元素的 metadata                                  |
| `forceUpdate()`                   | 手动触发更新                                         |
| `addMessageListener(listener)`    | 添加消息监听器；自动回放当前状态（返回取消订阅函数） |
| `removeMessageListener(listener)` | 移除之前添加的消息监听器                             |
| `getLastUpdateDuration()`         | 获取最近一次更新周期的耗时（毫秒）                   |
| `destroy()`                       | 清理所有资源                                         |

**RegisterOptions：**

| 选项               | 描述                                          |
| ------------------ | --------------------------------------------- |
| `metadata?`        | 附加到元素的自定义用户数据                    |
| `detectOcclusion?` | 为此元素启用 z-index 遮挡检测（覆盖全局设置） |

### ElementReceiver

ElementReceiver 运行在宿主页面，接收来自 iframe 的元素数据。

#### 构造函数

```typescript
new ElementReceiver(iframe?: HTMLIFrameElement | null, options?: ReceiverOptions)
```

**配置项：**

- `allowedOrigin?: string` - 允许的消息来源（默认：`'*'`）

当 `iframe` 为 `null` 或省略时，receiver 进入同页模式：不监听 `window` 的 message 事件，需要通过 `handleTrackerMessage()` 传递消息。

#### 方法

| 方法                            | 描述                                          |
| ------------------------------- | --------------------------------------------- |
| `on(event, callback)`           | 监听事件（'init'、'update'、'remove'）        |
| `off(event, callback)`          | 移除事件监听                                  |
| `getElements()`                 | 获取所有追踪的元素                            |
| `getElement(id)`                | 根据 ID 获取单个元素                          |
| `getIframe()`                   | 获取绑定的 iframe 元素（同页模式返回 `null`） |
| `getIframeBounds()`             | 获取 iframe 的边界矩形（同页模式返回 `null`） |
| `getContainerScroll()`          | 获取滚动容器的最新状态                        |
| `handleTrackerMessage(message)` | 直接处理 TrackerMessage（用于同页模式）       |
| `destroy()`                     | 清理所有资源                                  |

### OverlayPositioner

处理覆盖层定位的坐标变换。自动处理 iframe 的 margin、border、padding、transform、zoom 以及覆盖层容器偏移。

#### 构造函数

```typescript
new OverlayPositioner(options: OverlayPositionerOptions)
```

**配置项：**

- `iframe: HTMLIFrameElement` - iframe 元素
- `container: HTMLElement` - 覆盖层容器元素
- `clipOverflowMargin?: number` - 生成 `clip-path: inset(...)` 时未裁剪方向的边距（px）（默认：`100`）

#### 方法

| 方法                                           | 描述                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| `applyOverlayStyle(overlay, elementRect)`      | 直接将计算好的样式应用到覆盖层元素                |
| `getOverlayStyle(elementRect)`                 | 获取计算好的样式值（返回 `OverlayStyle \| null`） |
| `getScaleContext()`                            | 获取所有缩放和偏移值，用于自定义计算              |
| `transformCoordinates(x, y, context?)`         | 将 iframe 坐标转换为 CSS left/top                 |
| `transformDimensions(width, height, context?)` | 将尺寸转换为 CSS width/height                     |
| `scaleBorderRadius(radius, scale)`             | 缩放 border-radius 值                             |
| `scaleTransformOrigin(origin, scaleX, scaleY)` | 缩放 transform-origin 值                          |
| `getIframeScale()`                             | 获取 iframe 的 transform/zoom 合并缩放比例        |
| `getIframeScaleSeparate()`                     | 分别获取 iframe 的 zoom 和 transform 缩放比例     |
| `getAncestorScale()`                           | 获取祖先元素的累积缩放比例                        |
| `setContainer(container)`                      | 动态更新覆盖层容器引用                            |
| `setIframe(iframe)`                            | 动态更新 iframe 引用                              |
| `getIframe()`                                  | 获取当前 iframe 元素                              |
| `getContainer()`                               | 获取当前覆盖层容器元素                            |

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
  occlusion?: OcclusionInfo;     // 遮挡检测结果（启用后）
}
```

### OcclusionInfo 与 OccluderRect

遮挡检测结果的类型定义：

```typescript
interface OccluderRect {
  elementTag: string; // 遮挡元素的标签名
  elementId: string; // 遮挡元素的 id 属性
  bounds: {
    // 遮挡元素相对于 iframe 视口的边界
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface OcclusionInfo {
  clipBounds: {
    // 经过祖先 overflow 裁剪后的可见区域
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  occluders: OccluderRect[]; // 遮挡被追踪元素的元素列表
}
```

### OverlayStyle

`getOverlayStyle()` 返回的样式对象：

```typescript
interface OverlayStyle {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: string;
  clipPath: string | null; // 用于 overflow 裁剪 / z-index 遮挡的 clip-path
}
```

### TrackerMessage

ElementTracker 发送的消息类型：

```typescript
interface TrackerMessage {
  type: string; // 消息类型
  elements: ElementRect[]; // 元素数据
  updateDuration?: number; // 更新周期耗时（毫秒），用于性能监控
  // ...
}
```

## 使用场景

- **覆盖层标注**：在 iframe 元素上渲染高亮、标签或工具栏
- **视觉测试**：追踪元素位置用于视觉回归测试
- **数据分析**：监控用户与特定元素的交互
- **无障碍工具**：构建无障碍覆盖层和辅助工具
- **设计工具**：创建跨 iframe 边界工作的可视化编辑器

## 文档

- [快速参考](./docs/QUICK_REFERENCE.md) — 常用模式速查表（英文）
- [快速参考（中文）](./docs/QUICK_REFERENCE.zh-CN.md) — 常用模式速查表

## 测试

项目包含单元测试（Vitest）和 E2E 测试（Playwright）。

```bash
# 运行单元测试
npm test

# 以 watch 模式运行单元测试
npm run test:watch

# 运行单元测试并生成覆盖率报告
npm run test:coverage

# 运行 E2E 测试（需要开发服务器运行中，或自动启动）
npm run test:e2e

# 仅运行自动化性能基准测试
npm run test:perf

# 运行完整的发布前质量门禁
npm run test:publish
```

### 单元测试

单元测试覆盖三个核心模块：

- **OverlayPositioner** (`tests/unit/overlay-positioner.test.ts`) — 坐标变换计算、尺寸缩放、border-radius 缩放、CSS zoom/transform 解析、祖先元素缩放累积
- **ElementReceiver** (`tests/unit/receiver.test.ts`) — 消息处理、origin 验证、状态管理、事件系统、生命周期
- **ElementTracker** (`tests/unit/tracker.test.ts`) — 元素注册、数据采集、消息格式、生命周期

### E2E 测试

E2E 测试（`tests/e2e/overlay.spec.ts`）在真实浏览器中验证完整的追踪和覆盖层渲染流程：

- 覆盖层创建和数量
- 不同 iframe 样式下的覆盖层对齐（Margin、Zoom、Transform 及组合）
- 覆盖层模式切换
- 交互型覆盖层点击处理
- 动态注册/注销生命周期
- 滚动追踪
- Host 和 Inner 两条渲染路径的 clip-path 开关
- 元素样式 E2E（margin、padding、border、border-radius、transform、opacity）
- 内页覆盖层 E2E（同页覆盖层创建、对齐以及与宿主覆盖层共存）

### 性能测试

性能测试（`tests/e2e/performance.spec.ts`）通过 Playwright 驱动 benchmark 页面并断言：

- scroll-sync 覆盖层更新持续快于全量重算
- Host 覆盖层更新 p95 保持在单帧预算内
- Tracker 侧遮挡检测保持在发布延迟预算内

执行 `npm run test:perf` 时还会将 Markdown 和 JSON 报告写入
`test-results/performance/`。可以通过 `PERF_REPORT_DIR=path/to/reports` 修改输出目录。

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

## 开发

### 环境要求

- **Node.js 18+** —— 开发工具链（Vite、Vitest、ESLint 9）需要。发布出去的库本身是浏览器 SDK，运行时不依赖 Node。

### 脚本命令

```bash
# 启动开发服务器
npm run dev

# 构建库文件（ESM + CJS + .d.ts）
npm run build:lib

# 代码检查
npm run lint
npm run lint:fix    # 自动修复

# 代码格式化
npm run format
npm run format:check

# 运行单元测试
npm test

# 运行 E2E 测试
npm run test:e2e

# 仅运行性能基准测试
npm run test:perf

# 运行完整的发布前质量门禁
npm run test:publish

# 发布新版本（交互式）
npm run release

# 预览发布流程（不做实际变更）
npm run release -- --dry-run
```

### 发布

项目使用 [release-it](https://github.com/release-it/release-it) 进行自动化发布。执行 `npm run release` 后会：

1. 运行 `build:lib` 和单元测试作为前置检查
2. 根据 [Conventional Commits](https://www.conventionalcommits.org/) 推断下一个版本号
3. 更新 `package.json` 中的版本号
4. 生成/更新 `CHANGELOG.md`
5. 创建 git commit 和 tag（`v*.*.*`）
6. 发布到 npm

### Git Hooks

项目通过 [Husky](https://typicode.github.io/husky/) 配置了两个 Git hooks：

- **pre-commit**：运行 [lint-staged](https://github.com/lint-staged/lint-staged) — 对暂存文件自动执行 ESLint 和 Prettier 修复
- **commit-msg**：通过 [commitlint](https://commitlint.js.org/) 校验提交消息是否符合 [Conventional Commits](https://www.conventionalcommits.org/) 规范

提交消息格式：`type(scope): description`

- `feat(scope):` — 新功能
- `fix(scope):` — Bug 修复
- `docs(scope):` — 文档变更
- `refactor(scope):` — 代码重构
- `chore(scope):` — 维护任务

### TODO

- [ ] GitHub Actions CI（lint + 类型检查 + 单元测试 + E2E 测试）
- [ ] 自动化发布工作流（tag 触发 npm publish）

## 许可证

MIT
