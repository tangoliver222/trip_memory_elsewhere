# Elsewhere 视觉重置基线

日期：2026-07-14
状态：`visual-pass-failed`
冻结版本：`codex/elsewhere-full-visual-rebuild@b634e62`

## 结论

冻结版本的产品结构和主要交互可运行，但 390px 的 45 张最终截图没有通过新的视觉验收。旧文档中任何 `final`、`complete` 或“视觉达到参考线”的描述均不再作为当前结论。

## 可复现根因

1. `particle-targets.js` 的 `globe()` 对整个球面均匀取样，没有大陆掩膜；截图中的地球因此接近随机点球。
2. `quiet()` 仍将完整粒子池铺向屏幕深处，导致隐私、存储、设置等工具页也出现星空。
3. 所有 route 使用同一完整粒子池，差异主要来自随机分布和 `uNoiseStrength`，不是对象几何。
4. `MemorySceneManager` 没有 DOM anchor registry；照片、日期、地点、连接与 Three 粒子没有共享坐标。
5. City World 使用随机旋转照片和重复“照片原件”标签；Fragment Field 使用二维 DOM 卡片和 `PENDING` 空框。
6. Discovery 虽然 DOM 顺序是证据在前，但首屏 CSS 与截图时序仍让模糊标题先成为视觉主角。
7. Inbox 使用巨型问题标题和缺失原件空卡，两个判断对象不能在 390px 首屏内共同完成比较。
8. 旧 Playwright 视觉采集依赖固定等待时间，没有 `window.__ELSEWHERE_VISUAL_READY__` 稳定协议。

## 新参考

- `/Users/tangyixuan/Downloads/CODEX_ELSEWHERE_VISUAL_RESET.md`
- `/Users/tangyixuan/Downloads/ChatGPT Image 2026年7月14日 10_11_10 (1).png`
- `/Users/tangyixuan/Downloads/ChatGPT Image 2026年7月14日 10_11_11 (2).png`
- `/Users/tangyixuan/Downloads/ChatGPT Image 2026年7月14日 10_11_11 (3).png`
- `/Users/tangyixuan/Downloads/ChatGPT Image 2026年7月14日 10_11_12 (4).png`
- `/Users/tangyixuan/Downloads/ChatGPT Image 2026年7月14日 10_11_12 (5).png`

参考图只约束空间、材质、黑白比例、对象聚合、阅读层级与功能密度。示例图中的英文、城市数量、票据和照片不作为真实数据来源；演示包缺失的原件不得伪造。
