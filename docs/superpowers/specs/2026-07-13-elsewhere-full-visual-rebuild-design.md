# Elsewhere 全页面与语义粒子系统重建设计

**日期：** 2026-07-13  
**状态：** 总任务提示词预先批准自主实施  
**基线审计：** `docs/audits/2026-07-13-elsewhere-baseline-audit.md`

## 1. 目标

把 `design-lab/prototypes-vanilla` 建成唯一、独立、可安装、可构建、可测试的 Elsewhere 产品；31 个路由/状态全部围绕真实碎片、权威数据对象和证据顺序重构，并由单一 Three.js + GSAP 视觉引擎提供语义化地球、点云、关系流和路由心流。

## 2. 方案比较

### 方案 A：迁移旧版后逐页打补丁

优点是短期页面覆盖快。缺点是保留 1470/2070 行巨型文件、内联 handler、全局 `window`、错误数据和 Tailwind CDN，后续每次视觉调整都会牵动业务状态。拒绝。

### 方案 B：canonical 内干净重建（采用）

建立独立 Vite vanilla package、统一 fixture 索引、显式 store/action、事件委托、按职责拆分页面/overlay/visual 模块。真实原件保持 DOM，Three.js 只承载语义空间。初始工作量较高，但能同时满足可访问性、测试、性能与完整页面覆盖。

### 方案 C：WebGL 主导的全量 3D 重写

视觉连续性强，但真实票据/文字不可访问，工具页可用性差，移动端性能和测试成本过高，也违反“原件比粒子重要”。拒绝。

## 3. 总体架构

```text
index.html
  └─ AppViewport
      ├─ memory-canvas        Three.js 单 renderer
      ├─ page-content-layer   路由 DOM 与 SVG
      └─ overlay-root         Lens / Viewer / Else / Share

router → page registry → page renderer
  ↑                         ↓
store/actions ← controllers/events
  ↓
canonical fixtures + normalized indexes
  ↓
scene manager + GSAP flow controller
```

### canonical package

`design-lab/prototypes-vanilla` 自带 `package.json`、Vite 配置、测试配置、README、源码、public assets 与 tests。根 React 工程保留为 archive/workbench，不参与正式构建。

### 路由

- manifest 是路由与页面 contract 的唯一入口；
- route pattern 在注册时编译，参数与 query 使用 `URLSearchParams`；
- 未知深链显示人类可读 404，并回到最近安全父页面；
- `safeBack(fallback)` 只在 App 内 history 可用时后退；
- 路由离开时先运行 cleanup registry，再进入新页面。

### 数据

fixture 输出以下权威索引：

```text
citiesById
journeysById
fragmentsById
scenesById
placesById
connectionsById
discoveriesById
importBatchesById
userNotesById
```

每个可见事实携带来源与状态。代表性 fixture 与总计数分离。缺失 asset 使用 `requiredAsset` 证据节点；不得替换成远程素材。所有页面只调用 selector，不手写重复对象。

### store 与 controller

- store state 只保存 route、selection、filters、viewport、overlay stack、preferences 与用户 action 结果；
- actions 验证 ID 与状态迁移后产生新 state；
- 根节点统一事件委托处理 `data-action`，不使用内联 JS；
- page controller 注册的 pointer/wheel/keyboard/observer 放入 cleanup registry；
- overlay stack 保存上游 focus、scroll、field camera 与 selected object。

## 4. UI 与页面边界

### 全局 shell

`AppViewport` 最大 480px，桌面居中。Canvas、内容与 overlay 同一容器。Bottom navigation 只保留世界、发现、Else、我的。Else 只有一个 DOM 实例，打开 sheet 时通过 GSAP Flip 迁移。

### 页面族

| 页面族 | 页面 | 主视觉 | 粒子强度 |
| --- | --- | --- | --- |
| Onboarding | 价值、权限、首次导入、处理、首条连接 | 混合媒介到城市群 | 中/低 |
| World | 首页、城市索引、城市世界 | 粒子地球、城市碎片群 | 高/中 |
| Field & Intake | 全部碎片、导入、回执、收件箱 | LOD 碎片场、批次分流 | 中/低 |
| City reading | Capsule、时间、地点、连接与三种详情 | 原件章节、三种独立结构 | 中 |
| Discover | 首页、详情 | 支撑原件关系构图 | 中 |
| Me & tools | 首页、书写、隐私、偏好、存储、导出删除 | 用户暖纸层、工具信息 | 极低/关闭 |
| Overlays | Lens、Original Viewer、Else、Share | 选中原件与来源 | 按上下文 |

每页 contract 明确：所属空间、对象类型、密度、上游、唯一目的、唯一焦点、证据顺序、主动作、粒子语义、Else scope、下游和返回状态。contract 保存为 `src/page-manifest.js`，测试逐条读取。

## 5. 视觉系统

### 单一 Scene Manager

`MemorySceneManager` 只创建一次 renderer/camera/scene。路由切换调用 `setMode(mode, payload)`，不销毁 Canvas。模式为：

```text
world / city / fragment-field / import / processing
connection / discovery / capsule / else / quiet-tool
```

每种模式定义 particle target、颜色、密度、depth、noise、focus 与交互策略。页面离开只释放该模式独占 geometry/material/texture 和 listener。

### 粒子系统

`THREE.Points + BufferGeometry + ShaderMaterial`。Attributes：`aRandom`、`aScale`、`aPhase`、`aAmplitude`、`aColorMix`、`aTargetIndex`。Uniforms：`uTime`、`uProgress`、`uPositionRandom`、`uDepth`、`uNoiseStrength`、`uPointer`、`uFocus`、`uOpacity`、`uPixelRatio`、`uReducedMotion`。

顶点 shader 使用嵌入式 simplex noise；首次世界/关键章节用约 3 秒聚拢，普通路由为 0.6–1.2 秒，用户交互立即解除动画阻塞。Fragment shader 使用圆形 alpha falloff、深度尺寸衰减与低饱和冷暖混合。

### 地球

- 球体点云与真实经纬度投影；
- `OrbitControls` 禁止 pan、限制 zoom、启用 damping；
- 慢速自转在交互后暂停；
- 城市点投影用于 DOM label 与 Canvas 对齐；
- 低性能/无 WebGL 使用静态 SVG 点云球体。

### Fragment Field

DOM 原件与 Three.js 空间骨架共享 camera model。LOD 分为城市群、事件群、原件。pointer/touch 支持 pan、zoom、inertia、focus；搜索 Common Grounds 调整 target positions，筛选触发 layout transition。Lens 关闭恢复 camera/filter/selection。

### GSAP Flow Controller

只暴露命名 timeline：`routeExit`、`routeEnter`、`evidenceReveal`、`relationDraw`、`fragmentFocus`、`lensOpen`、`lensClose`、`elseOpen`、`elseAnswer`、`clusterFilter`、`globeToCity`、`cityToCapsule`。所有 timeline 存入 scope，路由离开统一 kill。ScrollTrigger 仅用于 Capsule、发现详情和长场景页；Flip 仅用于原件/Lens、城市/地球、发现来源连续性。

## 6. 视觉语言

- 深灰黑、蓝灰、暖灰；琥珀只用于用户确认与极少显影；
- 原件保持 0–6px 边角和真实比例；
- 票据、截图、菜单、文字使用不同材质；
- 工具页不使用巨型衬线与强 3D；
- 正文 16px，元数据 12–14px，触点最小 44px；
- 先原件，再时间/地点，再连接，再客观观察，再操作与用户解释。

## 7. 错误、降级与隐私

- WebGL 初始化或 context lost：切换 `data-visual-fallback`，保留 SVG/DOM；
- renderer 创建失败不阻止路由；
- broken asset 自动变成明确证据节点，不显示浏览器破图；
- fixture 引用错误在开发/测试直接失败，在生产显示可理解缺失状态；
- reduced motion：静止地球、直接显示关系、只淡入；
- reduced data/low profile：1.5k–4k particles、DPR 1、暂停环境动画；
- 分享默认隐藏金额、精确地址和私人笔记；
- 权限/删除/分享/原件查看隐藏 Else。

## 8. 测试策略

### 单元/集成

- router manifest 全匹配、query、safe back、404；
- 索引唯一性、引用完整性、counts 与代表集规则；
- store action、overlay stack、Lens/Else scope、camera restore；
- search/filter/layout、pan/zoom bounds；
- performance profile、motion preference；
- scene mode、single renderer、timeline cleanup、context lost fallback。

### Playwright

- 所有 manifest route 在 390、430、768、1440 打开；
- normal/reduced motion；
- Lens、Viewer、Else quick/answer、share、explore tabs、import/inbox actions；
- 自动断言 overflow、console/pageerror、broken image、内部 ID、Canvas/Else 实例数、BottomNav/overlay bounds；
- 截图与关键交互录屏写入 `artifacts/`。

## 9. 两轮视觉优化

第一轮只检查语义与构图：粒子来源、照片主次、地球辨识、Field 稳定中心、发现证据顺序、Else 安静程度与工具页克制。记录 before/after 参数与截图。

第二轮只检查性能与设备：high/balanced/low profile、DPR、首次载入、390px 帧率、暂停/恢复、dispose、timeline/listener 清理、触控发热、context lost 与 reduced motion。输出 `performance-report.json`、关键截图和视频。

## 10. 自审结论

- 无 `TBD`、`TODO` 或依赖用户补充才能实现的功能要求；
- 缺失真实资产有明确诚实 fallback；
- 架构与“唯一 canonical vanilla、单 Canvas、DOM 原件、统一数据层”一致；
- 全部路由、overlay、两轮粒子优化、截图、录屏和最终报告均进入实施范围；
- 不引入 React、R3F、Motion 或新的 UI/状态框架。

