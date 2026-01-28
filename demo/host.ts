import { ReceiverSDK } from '../src/receiver';
import type { ElementRect } from '../src/shared';

// Overlay 渲染模式
type OverlayMode = 'passthrough' | 'interactive' | 'labeled' | 'rich';

let currentMode: OverlayMode = 'passthrough';
let receiver: ReceiverSDK | null = null;

// DOM 元素引用
const iframe = document.getElementById('inner-frame') as HTMLIFrameElement;
const overlayContainer = document.getElementById('overlay-container')!;
const statusContent = document.getElementById('status-content')!;

// 模式切换按钮
const modeButtons = {
  passthrough: document.getElementById('mode-passthrough')!,
  interactive: document.getElementById('mode-interactive')!,
  labeled: document.getElementById('mode-labeled')!,
  rich: document.getElementById('mode-rich')!,
};

// 存储 overlay DOM 元素
const overlayElements: Map<string, HTMLElement> = new Map();

/**
 * 初始化 ReceiverSDK
 */
function initReceiver() {
  receiver = new ReceiverSDK(iframe);

  receiver.on('init', (elements) => {
    console.log('Received init:', elements);
    elements.forEach((el) => createOverlay(el));
    updateStatus();
  });

  receiver.on('update', (elements) => {
    elements.forEach((el) => updateOverlay(el));
    updateStatus();
  });

  receiver.on('remove', (elements) => {
    elements.forEach((el) => removeOverlay(el.id));
    updateStatus();
  });
}

/**
 * 创建 overlay 元素
 */
function createOverlay(elementRect: ElementRect) {
  const overlay = document.createElement('div');
  overlay.dataset.overlayId = elementRect.id;

  updateOverlayStyle(overlay, elementRect);
  overlayContainer.appendChild(overlay);
  overlayElements.set(elementRect.id, overlay);
}

/**
 * 更新 overlay 元素
 */
function updateOverlay(elementRect: ElementRect) {
  let overlay = overlayElements.get(elementRect.id);

  if (!overlay) {
    createOverlay(elementRect);
    return;
  }

  updateOverlayStyle(overlay, elementRect);
}

/**
 * 更新 overlay 样式和位置
 */
function updateOverlayStyle(overlay: HTMLElement, elementRect: ElementRect) {
  const { bounds, visibility, styles } = elementRect;
  const metadata = elementRect.metadata as { label?: string } | undefined;

  // 如果元素不可见，隐藏 overlay
  if (!visibility.isVisible) {
    overlay.style.display = 'none';
    return;
  }

  overlay.style.display = 'block';

  // 设置位置和尺寸
  overlay.style.left = `${bounds.x}px`;
  overlay.style.top = `${bounds.y}px`;
  overlay.style.width = `${bounds.width}px`;
  overlay.style.height = `${bounds.height}px`;

  // 应用 border-radius
  overlay.style.borderRadius = `${styles.border.radius.topLeft} ${styles.border.radius.topRight} ${styles.border.radius.bottomRight} ${styles.border.radius.bottomLeft}`;

  // 应用 transform
  if (styles.transform) {
    overlay.style.transform = styles.transform;
    overlay.style.transformOrigin = styles.transformOrigin;
  } else {
    overlay.style.transform = '';
  }

  // 根据模式设置类名和内容
  applyOverlayMode(overlay, elementRect, metadata?.label);
}

/**
 * 应用 overlay 模式
 */
function applyOverlayMode(overlay: HTMLElement, elementRect: ElementRect, label?: string) {
  // 清除旧的类名和子元素
  overlay.className = '';
  overlay.innerHTML = '';

  switch (currentMode) {
    case 'passthrough':
      overlay.className = 'overlay-passthrough';
      break;

    case 'interactive':
      overlay.className = 'overlay-interactive';
      overlay.onclick = () => {
        alert(`Clicked on: ${elementRect.id}\nLabel: ${label || 'N/A'}`);
      };
      break;

    case 'labeled':
      overlay.className = 'overlay-labeled';
      const labelEl = document.createElement('div');
      labelEl.className = 'overlay-label';
      labelEl.textContent = label || elementRect.id;
      overlay.appendChild(labelEl);
      break;

    case 'rich':
      overlay.className = 'overlay-rich';
      const toolbar = document.createElement('div');
      toolbar.className = 'overlay-toolbar';

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => alert(`Edit: ${elementRect.id}`);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => alert(`Delete: ${elementRect.id}`);

      const link = document.createElement('a');
      link.href = '#';
      link.textContent = 'Details';
      link.onclick = (e) => {
        e.preventDefault();
        alert(`Details for: ${elementRect.id}\n\nBounds: ${JSON.stringify(elementRect.bounds, null, 2)}`);
      };

      toolbar.appendChild(editBtn);
      toolbar.appendChild(deleteBtn);
      toolbar.appendChild(link);
      overlay.appendChild(toolbar);
      break;
  }
}

/**
 * 移除 overlay 元素
 */
function removeOverlay(id: string) {
  const overlay = overlayElements.get(id);
  if (overlay) {
    overlay.remove();
    overlayElements.delete(id);
  }
}

/**
 * 更新状态面板
 */
function updateStatus() {
  if (!receiver) {
    return;
  }

  const elements = receiver.getElements();

  if (elements.size === 0) {
    statusContent.innerHTML = '<p>No tracked elements</p>';
    return;
  }

  let html = '';
  elements.forEach((el) => {
    const metadata = el.metadata as { label?: string } | undefined;
    const visibleClass = el.visibility.isVisible ? 'visible' : 'hidden';
    html += `
      <div class="element-info ${visibleClass}">
        <strong>${el.id}</strong> (${metadata?.label || 'N/A'})<br>
        Position: (${Math.round(el.bounds.x)}, ${Math.round(el.bounds.y)})<br>
        Size: ${Math.round(el.bounds.width)} x ${Math.round(el.bounds.height)}<br>
        Visible: ${el.visibility.isVisible ? 'Yes' : 'No'}
        ${el.visibility.hiddenReason ? ` (${el.visibility.hiddenReason})` : ''}
      </div>
    `;
  });

  statusContent.innerHTML = html;
}

/**
 * 切换 overlay 模式
 */
function setMode(mode: OverlayMode) {
  currentMode = mode;

  // 更新按钮状态
  Object.entries(modeButtons).forEach(([key, btn]) => {
    btn.classList.toggle('active', key === mode);
  });

  // 重新渲染所有 overlay
  if (receiver) {
    receiver.getElements().forEach((el) => {
      updateOverlay(el);
    });
  }
}

/**
 * 重新渲染所有 overlay（当模式切换时）
 */
function rerenderOverlays() {
  if (!receiver) return;

  receiver.getElements().forEach((el) => {
    const overlay = overlayElements.get(el.id);
    if (overlay) {
      const metadata = el.metadata as { label?: string } | undefined;
      applyOverlayMode(overlay, el, metadata?.label);
    }
  });
}

// 绑定模式切换按钮事件
Object.entries(modeButtons).forEach(([mode, btn]) => {
  btn.addEventListener('click', () => setMode(mode as OverlayMode));
});

// iframe 加载完成后初始化
iframe.addEventListener('load', () => {
  console.log('iframe loaded, initializing ReceiverSDK');
  initReceiver();
});

// 暴露到全局，方便调试
(window as any).receiver = receiver;
(window as any).setMode = setMode;
