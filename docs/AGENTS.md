# Elsewhere Engineering Contract

> **Elsewhere 的美不来自把页面装饰成宇宙，而来自让真实旅行碎片在黑暗中逐渐找到彼此。**

本文件定义当前仓库的工程边界与修改纪律。它与产品、视觉文档共同构成实现的唯一约束集合。

## 1. 文档优先级

文件发生冲突时，严格按以下顺序执行：

1. `docs/AGENTS.md`：工程技术边界、变更纪律与验收方式；
2. `docs/Elsewhere_PRD_v3.0.md`：产品结构、对象职责、用户流程与范围；
3. `docs/Elsewhere_Visual_Design_System_v3.0.md`：视觉、交互与体验验收目标；
4. 当前页面任务说明；
5. 历史文档、旧视觉稿与历史实现。

PRD 决定产品是什么；视觉文档决定体验必须达到什么；本文件决定当前仓库允许怎样实现。

开始任务前，按任务范围阅读：

- 所有任务：本文件与 `docs/DESIGN_BRIEF.md`；
- 产品结构、对象页、流程任务：再读 `docs/Elsewhere_PRD_v3.0.md` 与 `docs/ELSEWHERE_PAGE_LOGIC_MAP_v1.md`；
- UI、动效、响应式任务：再读 `docs/Elsewhere_Visual_Design_System_v3.0.md`；
- 数据、后端或 AI 任务：先以 PRD 的对象、隐私和证据要求为边界；需要新增技术方案时，单独提出并获得批准。

## 2. Visual Production Workflow

Elsewhere uses a two-agent visual production workflow. The goal is to freeze a stable, truthful page structure before any advanced visual motion is introduced.

### Codex owns

Codex is responsible for:

- production architecture and vanilla HTML/CSS/JavaScript implementation;
- routing, state, data integrity and copy architecture;
- responsive layout, accessibility, page hierarchy and shared UI primitives;
- fragment selection, navigation, pan/zoom behavior, Fragment Lens, Else context and overlay behavior;
- automated tests, performance and final production integration.

### Gemini owns

Gemini is used only after the relevant page structure has been approved. It may propose or prototype:

- fragment reveal choreography and semantic particle behavior;
- relationship-line motion, spatial composition refinements and image/receipt reveal timing;
- ambient motion, Else micro-animation and visual review against approved references.

Gemini does not own page responsibilities, routing, data models, business logic, production state, copy architecture, accessibility or final production integration.

### File ownership and integration gate

- Codex may modify `src/`, `tests/`, `implementation/`, production CSS and production JavaScript.
- Gemini may modify only `design-lab/motion-pass/`, `motion-spec.json`, `visual-review.md`, and reference screenshots or videos.
- Gemini must not directly modify production files.
- Codex and Gemini must never modify the same files or branch at the same time.

A page may enter Gemini's motion phase only after its product purpose, static layouts at 390px and 430px, interaction without advanced motion, content/data correctness, no-overflow behavior, in-viewport overlays, reduced-motion behavior and baseline screenshot have all been approved. Codex translates an approved motion prototype into production code.

## 3. 当前技术基线

本项目当前使用 vanilla HTML、CSS 与 JavaScript，Vite 仅负责构建；现有 `globe.gl`、Three.js、MapLibre 和 `lottie-web` 是已经存在的能力。

未经用户在单独任务中明确批准，不得：

- 引入 React、Vue、Svelte、JSX 或新的前端运行时；
- 引入 Motion / Framer Motion、React Three Fiber、Drei、Rive、XState 或其他动画、渲染、状态管理框架；
- 替换路由、状态模型、构建系统或现有渲染引擎；
- 因视觉文档提到某个库而修改 `package.json`；
- 把视觉重构偷偷变成全项目架构迁移。

视觉文档里的 Motion、React Three Fiber、Rive、XState 等仅是**未来可评估的技术参考**，不是当前依赖或实现要求。视觉结果仍然是强制目标。

当前实现按以下优先级选择能力：

1. 语义 HTML 与 CSS variables；
2. CSS transition / keyframes；
3. Web Animations API；
4. IntersectionObserver、ResizeObserver、Pointer Events；
5. `requestAnimationFrame` 与 FLIP；
6. SVG path；
7. Canvas 2D；
8. 已存在的 WebGL / globe.gl 能力。

只有在原生方案有明确、可复现的技术瓶颈，并已说明受影响文件、包体成本、回归风险与 vanilla fallback 后，才能提出迁移；用户明确批准前不得改依赖或架构。

## 4. 产品不变量

- 一级心智固定为：`世界 / 发现 / Else / 我的`。Else 是跨层助手，不是普通第五个页面；“档案”不再是一级 Tab。
- `全部碎片 / Fragment Field` 属于世界的数据层；城市中的全部碎片只是同一对象的筛选状态。
- 对象链固定为：`Fragment → Entity → Visit/Event → 时间、地点与连接 → Discovery → 用户解释`。
- 同一碎片从任何入口均先打开唯一的 `Fragment Lens`；只有 Lens 才进入完整原件。
- 原件先于派生内容；证据先于 AI 观察；用户解释永远高于模型解释。
- AI 不替用户判断情绪、人格或成长；不确定、冲突和未安放是合法状态。
- World 是可浏览数据世界，Discover 是少量值得打扰的发现，Me 是用户解释与控制，Else 必须把用户带回来源。

## 5. 视觉与交互不变量

- 每屏只有一个主要视觉焦点与一个主动作。
- 页面先显示原始碎片，再显示时间/地点，再显示连接，最后才显示 AI 观察与操作。
- 艺术感来自有证据意义的策展，不来自随机错落、星空背景、霓虹或同款玻璃黑卡。
- 粒子必须表达对象或状态：显影、聚拢、连接、未决或 Else 状态；禁止随机装饰星点。
- 世界、发现、我的必须有不同职责与密度：沉浸、探索、工具；不得把所有页面做成同类卡片列表。
- Else 同一时刻只能有一个实例；原件全屏、批量处理、长文本输入、分享、删除和权限场景隐藏 Else。
- Overlay、Sheet、Modal 和 Drawer 必须约束在 `AppViewport` 内；禁止 `100vw` 脱离 480px 移动容器。
- 正文至少 16px；主触点至少 44px；必须支持 `prefers-reduced-motion`。

## 6. 修改纪律

除非任务明确要求，否则不得重写无关页面、改变公共数据契约或扩张页面职责。

禁止：

- 通用暗黑 Dashboard、Web3、赛博霓虹、随机神经网络或科技扫描线；
- 用普通媒体网格代替 Fragment Field；
- 所有对象使用同款圆角黑卡、图片裁成同样圆形或把文字做成过大的散文标题；
- 用固定绝对坐标作为移动端主体布局；
- 复制素材冒充不同时间/事件；
- 用虚假进度、无来源结论或 AI 情绪推断填补空白；
- 横向溢出、桌面双栏硬塞进移动端、导航遮挡正文或 Overlay 横跨浏览器。

## 7. 视觉生产协议（Gemini-gated）

视觉方向必须先于生产实现被批准。对于新增页面、视觉重构或改变页面构图的任务，严格遵循：

```text
页面契约
→ Gemini 独立高保真视觉原型
→ 用户批准构图与心流
→ Codex 搭建或重构生产页面
→ Gemini 依据生产截图做视觉审查
→ Codex 只修复明确差异
```

执行规则：

1. 先从 `docs/ELSEWHERE_PAGE_LOGIC_MAP_v1.md` 取得页面职责、入口、主动作和下游对象。
2. 视觉原型与审查必须使用 `design-reference/README.md`、对应的 `good/`、`bad/`、`assets/` 与 `fixtures/`。
3. Gemini 的任务是产出或审查视觉真相，不直接修改生产代码；Codex 不在缺少批准视觉真相时自行探索新的构图方向。
4. 原型批准前，Codex 只可做为生成截图所必需的最小准备，不得把未批准方向扩散到其他页面。
5. 审查输出必须写成可定位的差异：页面区域、当前表现、目标表现、严重级别和验收条件。没有明确差异，不做“凭感觉再设计”。
6. `good/` 只能提取被写明的优点；`bad/` 中的模式一律不复现。二者都不是可直接照抄的页面模板。

### Design Lab 隔离规则

- 视觉原型和交互实验只能写入 `/design-lab`，不得修改 `src/`、生产入口、生产路由、生产样式或 `package.json`。
- `/design-lab/index.html` 是实验室入口；它以 `?prototype=world-home` 形式切换核心原型。实验室控制条只服务桌面预览，不能进入 390px 的产品画布或被复用为生产导航。
- 初始原型范围固定为：`world-home`、`city-fragment-field`、`fragment-field`、`discovery-detail`。新增实验需先增加页面契约。
- 实验室只能从 `design-reference/assets/` 和 `design-reference/fixtures/manifest.json` 读取素材与数据；不得用生产 `src/main.js` 当作视觉数据源。
- 原型被批准前，实验代码不得被复制、import 或链接到生产页面。

## 8. 每页实施前的说明

在写代码前，先在任务记录中明确：

```text
页面名称：
所属一级空间：
对象类型：
页面密度：沉浸型 / 探索型 / 工具型
用户上游入口：
唯一目的：
唯一视觉焦点：
证据显影顺序：
唯一主动作：
必须元素：
禁止元素：
粒子语义：
Else 默认范围：
下游页面：
返回保留状态：
复用组件：
不会修改的其他页面：
```

范围或页面职责不明确时，先提问；不要以“补齐功能”为理由自行扩大产品结构。

## 9. 完成后的最低验收

每个相关页面至少验证：

1. 390 × 844 与 430 × 932 下 `scrollWidth === clientWidth`；
2. 导航、键盘和 Sheet 不遮挡主要内容或主动作；
3. Overlay 未离开 AppViewport；
4. Else 的渲染数量不超过 1，且在应隐藏的上下文不出现；
5. `prefers-reduced-motion` 下信息与操作仍完整；
6. 原件、时间、地点、连接、AI 观察、用户文字的层级符合证据先行；
7. 事实可回源，未决内容未被伪装为结论；
8. 新增的动画只解释状态或空间变化，不持续抢占注意力。
