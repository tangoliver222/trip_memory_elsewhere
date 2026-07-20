# Elsewhere 前端视觉缺陷审计 · 2026-07-20

## 审计范围

- 本地生产同源构建；
- 390 × 844 全部 28 个路由；
- 430 × 932 录屏关键链；
- World、City、Fragment Field、Discover Home、Discover Detail 与 Else；
- 页面顶部和约 58% 滚动位置；
- 等待 `window.__ELSEWHERE_VISUAL_READY__` 后的稳定帧。

## 已通过的基础门槛

- 前端单元测试：88 / 88；
- Vite production build：通过，73 modules；
- 390px 全路由运行时与视口检查：28 / 28；
- 所有路由均只有一个 `#memory-canvas`，且无破图、横向页面溢出或控制台异常。

## 自动测试此前漏掉的问题

### P0 · Discover Home 原件场压住结论区

移动端 `.featured-space` 只有 330px 高，但第四个绝对定位原件的下边界超过该空间；`.featured-copy` 因此在原件尚未结束时开始。实测稳定帧间距为负值，结论标题和证据碎片发生叠压。

### P0 · Fragment Field 工艺原件重复覆盖说明

票据、票根、菜单和截图本身已经包含可读文字，节点底部又统一叠加 `evidencePreview`，在 110 × 150px 的移动节点中形成重复文字块。问题不是粒子数量，而是内容锚点内部的信息层级过载。

### P1 · City 底部固定层风险

在中段截图里固定导航会覆盖尚未进入可视区的 City Footer；滚动到底部后辅助动作与导航仍有约 48px 间距，当前结构可用。将其加入回归契约，防止后续改动把真实主动作压进固定导航。

### P1 · 动画中间帧容易被误判为乱码或模糊

Discover Detail 的标题在显影 Timeline 中使用 blur。普通全路由截图等待固定时长，而非视觉 ready 信号，可能记录中间帧。录屏与正式截图必须使用 `__ELSEWHERE_VISUAL_READY__`，不能用任意 `waitForTimeout` 作为完成条件。

## 修复边界

- 保留 World / City 已冻结的构图和原件数据；
- 不把 Fragment Field 改成网格；
- 不删除工艺原件，只去掉移动端重复的说明覆盖；
- 只扩展 Discover 移动证据场的布局高度，不改变证据顺序；
- 粒子仍由同一 `MemorySceneManager` 控制。

