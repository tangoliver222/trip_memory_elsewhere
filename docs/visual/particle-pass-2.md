# Elsewhere 粒子、资源与性能校准 · Pass 2

日期：2026-07-14
测量报告：`performance-report.json`

## 根因与修正

Pass 2 没有盲目降低粒子数量。浏览器测量显示 3,000 / 9,800 粒子在目标设备档位内均能达到约 60 FPS，真正的资源风险是空间流切换时旧 GSAP timeline 仍可能继续写同一组 uniforms。因此本轮做了以下根因修正：

- 新空间流创建前终止并清空所有旧流；任何时刻最多追踪一条 timeline。
- `window.__ELSEWHERE_DEBUG__` 暴露只读 renderer、timeline、particle、profile、paused 与 mode 状态，供自动验收和性能脚本使用。
- WebGL context loss 会暂停渲染、显示静态 Memory Scene 后备；页面内容和主操作保持可用。
- context restored 会隐藏静态后备并恢复渲染。
- 路由切换关闭叠层、收起 Else，并将持久滚动层复位到新页面顶部；关闭 Lens 仍按 snapshot 返回原位置。
- World 的 OrbitControls 只监听 Canvas，避免拖拽控制捕获 CTA 和城市按钮。

## 实测结果

| 档位 | 粒子 | 有效 DPR | 首个可见画面 | 平均 FPS | 最低采样 FPS | Renderer / Canvas | 活动旧流 | Context 后备 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Low · 390 | 3,000 | 1.0 | 347ms | 60.4 | 53.5 | 1 / 1 | 0 | 通过 |
| High · 1440 | 9,800 | 1.0 | 237ms | 60.0 | 53.2 | 1 / 1 | 0 | 通过 |
| Reduced Motion · 390 | 3,000 | 1.0 | 374ms | 60.1 | 53.5 | 1 / 1 | 0 | 通过 |

三档全部满足：首个可见画面 < 2.5s、粒子 ≤ 9,800、有效 DPR ≤ 1.5、单 Renderer/Canvas、无活动旧流、context loss 后主操作可用。

## 最终空间参数

- Low：3,000 粒子、30 FPS 调度上限、DPR 1、无抗锯齿。
- Balanced：7,200 粒子、45 FPS 调度上限、DPR 1.25。
- High：9,800 粒子、60 FPS 调度上限、DPR 1.5。
- Reduced motion 强制 Low；形态仍可辨认，但转场缩短为接近即时状态变化。
- 点尺寸 1.35，最大 5px；主色为银白 `#d8e0de`，暖色约每 71 个粒子一次。

## 六个标志性时刻最终状态

1. World 首次进入：深场散布 → 点云地球 → 城市亮点 → 标题；约 3.4s 形成。
2. World→City：同一粒子池先城市脉冲，再向前景碎片场重组；无黑屏切页。
3. Fragment Field：九个手机空间锚点、多 Z 层、惯性拖拽、搜索回流、非相关节点降噪。
4. Discovery：三日期证据从不同纵深出现，关系流成立，共同地点凝聚，标题延迟显影。
5. Fragment Lens：原节点提取、背景后退、面板可读；关闭按相反方向返回 snapshot。
6. Else：idle / reading / found / uncertain / conflict 共用一个 Orb 和同一场景粒子池。

视频证据位于 `design-lab/prototypes-vanilla/artifacts/videos/`。
