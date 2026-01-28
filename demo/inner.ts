import { TrackerSDK } from '../src/tracker';

// 创建 TrackerSDK 实例
const tracker = new TrackerSDK();

// 注册所有需要追踪的元素
const elementsToTrack = [
  { id: 'element-edge-top', label: 'Edge Top' },
  { id: 'element-edge-left', label: 'Edge Left' },
  { id: 'element-1', label: 'Red Box' },
  { id: 'element-2', label: 'Blue Rounded' },
  { id: 'element-3', label: 'Green Circle' },
  { id: 'element-4', label: 'Purple Rotated' },
  { id: 'element-5', label: 'Orange Fancy' },
  { id: 'element-bottom', label: 'Bottom Element' },
];

// 等待 DOM 完全加载后注册元素
document.addEventListener('DOMContentLoaded', () => {
  elementsToTrack.forEach(({ id, label }) => {
    const element = document.getElementById(id);
    if (element) {
      tracker.register(element, id, {
        metadata: { label },
      });
    }
  });

  console.log('TrackerSDK initialized, tracking', elementsToTrack.length, 'elements');
});

// 暴露到全局，方便调试
(window as any).tracker = tracker;
