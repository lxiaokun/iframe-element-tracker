# ElementTracker - 快速参考指南

## 概述 - 功能简介

跟踪 iframe 内的 DOM 元素，并通过 `postMessage` 将其位置、尺寸、可见性和样式信息发送到宿主页面，实现跟随被跟踪元素的覆盖层 (Overlay) 标注。

---

## 核心类

### ElementTracker（iframe 侧）

```typescript
const tracker = new ElementTracker(options);
tracker.register(element, 'id', { metadata });
tracker.unregister('id');
tracker.destroy();
```

### ElementReceiver（宿主页面侧）

```typescript
const receiver = new ElementReceiver(iframe);
receiver.on('init', (elements) => {});
receiver.on('update', (elements) => {});
receiver.on('remove', (elements) => {});
const el = receiver.getElement('id');
receiver.destroy();
```

### OverlayPositioner（宿主页面侧）

```typescript
const positioner = new OverlayPositioner({ iframe, container });
const style = positioner.getOverlayStyle(elementRect);
positioner.applyOverlayStyle(overlayElement, elementRect);
```

---

## 每个元素跟踪的数据

```typescript
ElementRect {
  id: string;                    // 你的跟踪器 ID
  timestamp: number;             // 更新时间

  // DOM 元数据
  attributes: {
    elementId: string;           // id 属性
    classList: string[];         // class 列表
    dataset: Record<string, string>; // data-* 属性
  };

  // 位置和尺寸（iframe 视口坐标）
  bounds: { x, y, width, height };

  // 可见性信息
  visibility: {
    isVisible: boolean;
    isFullyVisible: boolean;
    visibleBounds: { x, y, width, height } | null;
    hiddenReason?: 'offscreen' | 'hidden' | 'collapsed' | 'clipped';
  };

  // CSS 属性
  styles: {
    boxSizing, padding, margin, border,
    transform, transformOrigin,
    overflow, clipPath,
    display, opacity, zIndex, pointerEvents, position,
    outline, boxShadow, filter
  };

  // 滚动状态（如果可滚动）
  scroll?: { top, left, width, height };

  // 你的自定义数据
  metadata?: Record<string, unknown>;
}
```

---

## 工作原理

1. **iframe 页面：** 使用跟踪器注册元素
2. **跟踪器：** 观察元素变化（ResizeObserver、IntersectionObserver、scroll、resize）
3. **跟踪器：** 计算完整的元素状态
4. **跟踪器：** 通过 `postMessage` 发送消息到宿主页面
5. **宿主页面：** ElementReceiver 接收并验证消息
6. **宿主页面：** 触发事件（'init'、'update'、'remove'）
7. **宿主页面：** 应用程序更新覆盖层位置
8. **OverlayPositioner：** 处理坐标转换
9. **结果：** 覆盖层跟随被跟踪的元素！🎉

---

## 更新触发条件

| 触发条件     | 是否节流？ | 响应时间 |
| ------------ | ---------- | -------- |
| 元素尺寸变化 | 是 (rAF)   | ~16ms    |
| 可见性变化   | 是 (rAF)   | ~16ms    |
| 滚动         | 否         | <1ms     |
| 窗口尺寸调整 | 否         | <1ms     |

---

## 带 Transform 的元素边界

**无 transform 时：**

```
bounds = { x: domRect.x, y: domRect.y, width: domRect.width, height: domRect.height }
```

**有 transform 时：**

1. 从 `transform` CSS 中解析 `matrix(a, b, c, d, e, f)`
2. 获取原始尺寸：`offsetWidth`、`offsetHeight`
3. 对 4 个角点进行变换
4. 找到最小坐标
5. **反转变换**以获得未变换的位置

这确保了即使元素旋转/缩放，覆盖层也能正确对齐。

---

## 可见性判定

```
元素是否被 CSS 隐藏？
  是 → 'hidden'
  否 ↓

元素尺寸是否为零？
  是 → 'collapsed'
  否 ↓

元素是否在视口之外？
  是 → 'offscreen'
  否 ↓

元素是否被视口部分裁剪？
  是 → 'clipped'（计算 visibleBounds）
  否 → isFullyVisible = true
```

---

## 消息格式

```typescript
interface TrackerMessage {
  type: 'IFRAME_ELEMENT_TRACKER';
  action: 'init' | 'update' | 'remove';
  elements: ElementRect[];
  containerScroll: {
    scrollX: number;
    scrollY: number;
    scrollWidth: number;
    scrollHeight: number;
  };
}
```

---

## 常用模式

### 模式 1：基础覆盖层跟踪

```typescript
// iframe 页面
const tracker = new ElementTracker();
tracker.register(document.getElementById('btn1'), 'btn1');

// 宿主页面
const receiver = new ElementReceiver(iframe);
receiver.on('update', (elements) => {
  elements.forEach((el) => updateOverlay(el));
});
```

### 模式 2：自定义元数据 (Metadata)

```typescript
tracker.register(element, 'id', {
  metadata: { label: 'Primary Button', type: 'button' },
});

receiver.on('update', (elements) => {
  elements.forEach((el) => {
    overlay.title = el.metadata.label;
  });
});
```

### 模式 3：选择性跟踪

```typescript
receiver.on('update', (elements) => {
  elements.forEach((el) => {
    if (el.visibility.isVisible) {
      overlay.style.display = 'block';
      // 更新位置
    } else {
      overlay.style.display = 'none';
    }
  });
});
```

### 模式 4：同页面跟踪

```typescript
// 无 iframe - 直接回调模式
const tracker = new ElementTracker({
  onMessage: (message) => {
    receiver.handleTrackerMessage(message);
  },
});
```

---

## 性能建议

1. **不要跟踪数百个元素** - 每次更新的复杂度为 O(N)
2. **谨慎使用 metadata** - 会增加序列化体积
3. **批量更新覆盖层** - 在一个循环中更新所有覆盖层
4. **考虑采样** - 如果超过 500 个元素，可以隔一个跟踪一个
5. **利用可见性状态** - 当元素不可见时隐藏覆盖层

---

## 坐标计算（用于自定义变换）

应用覆盖层位置时：

```
1. 从跟踪器获取元素边界（iframe 坐标）
2. 获取 iframe 在宿主页面中的边界矩形
3. 获取缩放上下文 (Scale Context)：iframeScale、ancestorScale 等
4. 坐标转换：
   - 考虑 iframe 边距（按 zoom × ancestor 缩放）
   - 考虑 iframe 变换（不影响边距）
   - 考虑边框/内边距偏移
   - 考虑覆盖层容器偏移
5. 除以 ancestor scale（CSS 会进行缩放）
```

`OverlayPositioner` 类会自动处理上述所有计算。

---

## 已知限制

1. **Transform：** 仅完全支持 `matrix()`，`matrix3d()` 为近似处理
2. **遮挡：** 不检测兄弟元素或祖先元素的遮挡
3. **滚动：** 仅支持单个滚动容器
4. **性能：** 滚动事件未节流（少于 100 个元素时没问题）
5. **浏览器：** 需要 ResizeObserver 和 IntersectionObserver 支持

---

## TypeScript 类型

```typescript
import type {
  ElementRect,
  ElementVisibility,
  ElementAttributes,
  ElementStyles,
  ElementScroll,
  TrackerMessage,
  ContainerScroll,
  ScaleContext,
  OverlayStyle,
} from 'iframe-element-tracker';
```

---

## 调试

```typescript
// 检查缓存的元素
const elements = receiver.getElements();
console.log(elements); // Map<id, ElementRect>

// 检查单个元素
const el = receiver.getElement('btn1');
console.log(el.bounds);
console.log(el.visibility);

// 检查滚动状态
console.log(receiver.getContainerScroll());

// 检查 iframe 位置
console.log(receiver.getIframeBounds());

// 监听所有消息
tracker.addMessageListener((msg) => {
  console.log('Message:', msg);
});
```

---

## API 参考

### ElementTracker

| 方法                              | 描述           |
| --------------------------------- | -------------- |
| `register(element, id, options)`  | 开始跟踪元素   |
| `unregister(id)`                  | 停止跟踪元素   |
| `updateMetadata(id, metadata)`    | 更新元素元数据 |
| `forceUpdate()`                   | 手动触发更新   |
| `addMessageListener(callback)`    | 监听所有消息   |
| `removeMessageListener(callback)` | 移除监听器     |
| `destroy()`                       | 清理资源       |

### ElementReceiver

| 方法                        | 描述                                 |
| --------------------------- | ------------------------------------ |
| `on(event, callback)`       | 监听 'init'、'update'、'remove' 事件 |
| `off(event, callback)`      | 移除监听器                           |
| `getElements()`             | 获取所有缓存的元素                   |
| `getElement(id)`            | 获取单个元素                         |
| `getIframe()`               | 获取跟踪的 iframe                    |
| `getIframeBounds()`         | 获取 iframe 在宿主页面中的位置       |
| `getContainerScroll()`      | 获取滚动状态                         |
| `handleTrackerMessage(msg)` | 直接消息处理（同页面模式）           |
| `destroy()`                 | 清理资源                             |

### OverlayPositioner

| 方法                                      | 描述                         |
| ----------------------------------------- | ---------------------------- |
| `getOverlayStyle(elementRect)`            | 获取覆盖层的 CSS 值          |
| `applyOverlayStyle(element, elementRect)` | 将 CSS 应用到元素            |
| `getScaleContext()`                       | 获取所有变换参数             |
| `transformCoordinates(x, y)`              | 将 iframe 坐标转换为宿主坐标 |
| `transformDimensions(w, h)`               | 转换尺寸                     |
| `scaleBorderRadius(radius, scale)`        | 缩放 border-radius           |
| `scaleTransformOrigin(origin, sx, sy)`    | 缩放 transform-origin        |

---

## 文件结构

```
src/
├── tracker/             # ElementTracker（iframe 侧）
├── receiver/            # ElementReceiver（宿主页面侧）
├── overlay-positioner/  # OverlayPositioner（宿主页面侧）
└── shared/
    ├── types.ts        # 所有 TypeScript 类型定义
    └── constants.ts    # MESSAGE_TYPE
```

---

## 常见问题

### 覆盖层不跟随元素

- ❌ ElementReceiver 未监听 'update' 事件
- ❌ 元素未在跟踪器中注册
- ❌ 覆盖层 CSS position 不是 absolute
- ✅ 验证 element.visibility.isVisible

### Transform 显示不正确

- ❌ 仅完全支持 `matrix()` 变换
- ✅ 使用 `transform: translateX(10px)` 而不是 `transform: skew()`

### 消息未接收到

- ❌ 源 (Origin) 不匹配（检查 allowedOrigin）
- ❌ iframe.contentWindow 检查失败
- ✅ 检查 ElementReceiver 是否使用了正确的 iframe 引用创建

### 性能问题

- ❌ 跟踪元素过多（>500）
- ❌ 复杂 CSS 导致 getComputedStyle() 调用开销大
- ✅ 使用可见性检查跳过隐藏的元素

---

生成日期：2026 年 4 月 26 日
