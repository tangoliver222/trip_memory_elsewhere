# Elsewhere 全量重构交付说明

> **已废止 · visual-pass-failed（2026-07-14）**：本文件记录冻结版本 `b634e62` 的旧交付判断，不再代表当前视觉验收结论。新的纠偏基线见 `docs/visual/visual-reset-baseline.md`。

## 交付结果

主实现位于：

`design-lab/prototypes-vanilla`

这是唯一权威运行包；旧 React/Vite 尝试已从该运行链路中隔离。实现覆盖所有清单路由、四类叠层、Else 五状态、单一 Three.js Memory Scene、GSAP 形态流、真实交互、响应式与减弱动效。

## 运行

```bash
cd design-lab/prototypes-vanilla
npm run dev
```

构建与验证：

```bash
npm test
npm run build
npm run test:e2e
cd ../..
node scripts/profile-performance.mjs
```

最终新鲜验证结果：62 个单元/契约测试通过；Playwright 在 390、430、768、1440 与 reduced-motion 五个项目中 183 项通过、37 项按证据采集条件跳过、0 失败；生产构建通过；禁用模式扫描和 `git diff --check` 通过。

## 视觉证据

- Pass 1：`design-lab/prototypes-vanilla/artifacts/screenshots/pass-1/`
- Final：`design-lab/prototypes-vanilla/artifacts/screenshots/final/`
- 视频：`design-lab/prototypes-vanilla/artifacts/videos/`
- 全页面生成审计（本地、不入 Git）：`design-lab/prototypes-vanilla/artifacts/screenshots/all-pages/`
- 性能：`performance-report.json`

五段视频分别记录：地球到城市、Field 搜索与 Lens 返回、Discovery 生长、Else found、Explore 三结构重组。

最新性能实测：Low 390 为 3,000 粒子 / 60.4 FPS，High 1440 为 9,800 粒子 / 60.0 FPS，reduced-motion 为 3,000 粒子 / 60.1 FPS；三档均保持单 Renderer、单 Canvas、0 条活动旧流，并通过 WebGL context-loss 后备测试。

## 架构保证

- 页面切换不销毁 `#memory-canvas`。
- Renderer 创建次数保持 1；粒子池保持 1。
- 新空间流会终止旧 timeline，避免共享 uniforms 被并发写入。
- Lens 与 Original Viewer 使用叠层 stack；Lens 关闭恢复原场景 snapshot。
- Else Orb 只存在一个 DOM 实例，打开时用 GSAP Flip 移入抽屉头部。
- 所有页面数据来自 canonical fixtures 与 selectors；界面不暴露内部 ID。
- 缺失原件明确标记，不用生成图片冒充用户记忆。

## 后续接入真实数据

生产接入时优先替换 `src/fixtures/data.js` 的 fixture loader，但保留当前实体字段、indexes 和 selectors 契约。真实票据、菜单、截图与其他城市代表原件到位后，只需填入 `asset` 并清除对应 `requiredAsset`；现有 Field、City、Discovery、Lens 和 Capsule 结构会自动使用原件。

不要在页面内新建第二个 Three.js 场景，也不要为单页复制 Else Orb。新视图应向 `MemorySceneManager` 提供语义 target，让同一粒子池改变排列。
