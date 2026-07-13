# Elsewhere 全量重建基线审计

**日期：** 2026-07-13
**分支：** `codex/elsewhere-full-visual-rebuild`
**独立工作区：** `/Users/tangyixuan/trip_memory_elsewhere/.worktrees/elsewhere-full-visual-rebuild`

## 1. 审计范围

已完整读取并交叉核对：

- `CODEX_ELSEWHERE_FULL_REBUILD_PROMPT.md`；
- 根目录与 `docs/AGENTS.md`；
- `Elsewhere_PRD_v3.0.md`；
- `Elsewhere_Visual_Design_System_v3.0.md`；
- `ELSEWHERE_PAGE_LOGIC_MAP_v1.md`；
- `DESIGN_BRIEF.md`；
- `design-reference/README.md`、全部 fixture、正反例图片；
- `design-lab/prototypes-vanilla` 与 `design-lab/elsewhere-frontend-v1` 全部入口、路由、store、fixtures、页面、overlay、组件和样式。

项目目录中没有 `.docx` 文件；核心资料实际以同名 Markdown 交付。Downloads 中未发现可明确对应 Elsewhere 的 DOCX，故本次以仓库内 v3.0 文档为权威原文。

## 2. 可复现基线

### 根预览工程

| 命令 | 结果 | 结论 |
| --- | --- | --- |
| `npm install` | 213 packages，0 vulnerabilities | 仅安装根 React workbench 依赖 |
| `npm run build` | exit 0 | 只证明根 React 预览能构建 |
| `npm run lint` | exit 0 | 只覆盖根 TypeScript |
| `npm test` | exit 1：Missing script | 仓库没有自动测试基线 |

### 正式 vanilla 入口

访问：`/design-lab/prototypes-vanilla/index.html#/world`

- `#app-root` 子节点数量：0；
- `src/app.js` 返回 404；
- `tokens.css`、`components.css`、`pages.css`、`states.css` 缟失；
- 页面截图为全黑空白；
- 入口仍引用根 `/src/index.css` 与 Google Fonts CDN；
- 目录没有自己的 `package.json`、Vite 配置、测试配置或 README。

证据：

- `artifacts/baseline/canonical-390x844.png`；
- `artifacts/baseline/report.json`。

### 旧版 vanilla 入口

访问：`/design-lab/elsewhere-frontend-v1/index.html#/world`

- 页面同样为空；
- 启动即抛出 `Invalid regular expression ... Unmatched ')'`；
- 根因是路由构造先转义 `:`，再替换参数，占位符前遗留反斜线，使捕获组开括号被转义；
- 入口依赖浏览器 Tailwind CDN 与 Google Fonts CDN。

证据：

- `artifacts/baseline/legacy-390x844.png`；
- `artifacts/baseline/report.json`。

## 3. 根因清单

### P0：目录与运行入口

1. canonical 目录只是部分文件集合，不是独立应用。
2. 旧版目录反而拥有 `app.js`、页面、overlay 和完整样式，形成两套不一致真相。
3. 根 Vite 的成功构建掩盖 canonical 空白页。
4. `design-lab` 路由与正式启动说明不一致。
5. 远程 Tailwind、Google Fonts 与 Unsplash 使正式体验无法离线、无法稳定截图。

### P0：路由、事件与状态

1. 旧 router 动态正则在模块加载阶段崩溃。
2. canonical router 修了正则，但没有应用入口。
3. 页面大量使用 `onclick`/`onchange` 字符串和 `window.*`，旧版甚至直接调用 module scope 的 `store`。
4. `history.back()` 在深链进入时可能离开 App。
5. overlay 状态只用布尔值，未保存 camera、scroll、filter、selected fragment 和上游层级。
6. 页面重绘后重新注册局部 listener，缺少统一销毁机制。

### P0：数据可信性

1. canonical fixture 将 Bangkok/Chiang Mai/Tokyo 写成 9/3/3 个碎片，与权威 63/28/81 不一致。
2. 入库连接数 canonical 为 2，权威 fixture 为 1。
3. 页面依靠 ID 字符串包含关系推断城市、地点和场景，而不是索引。
4. Chiang Mai/Tokyo 使用远程 Unsplash，违反真实素材与本地化要求。
5. 代码包含无来源气味、温度、情绪、治愈式观察与“完美对齐”等越界结论。
6. 缺失票据、菜单、地图没有统一的 `requiredAsset` 展示策略。
7. 页面会显示内部 ID、置信百分比和技术证据语言。

### P1：架构可维护性

1. canonical `pages/world.js` 2070 行，世界首页、城市、Field、导入、回执、收件箱、Capsule、探索、三个详情混在一个文件。
2. 数据、渲染、控制器与动画耦合；无法针对单页测试。
3. `store` 直接暴露可变数组，reset 会写入新的伪文案。
4. Fragment Lens、Else、Original Viewer、Share Preview 没有统一 overlay stack 与 scroll lock。
5. 没有 scene lifecycle、timeline lifecycle、listener cleanup 或 WebGL fallback 边界。

### P1：假交互与视觉问题

1. 旧 Fragment Field 搜索与筛选主要改变 opacity/brightness，城市按钮使用 alert。
2. pan/zoom、LOD、聚集、Lens 恢复没有统一 camera model。
3. 发现详情保留“98%”和先标题后证据。
4. Else 仍使用 `SPATIOTEMPORAL DEDUCTION`、固定位置与硬编码回答。
5. 全局样式依赖 Tailwind class，正文存在 8–10px 用户可读文字。
6. 页面大量同款黑卡、琥珀色边框和技术英文。

## 4. 可保留内容

- v3.0 PRD、视觉系统、页面逻辑图和 reference fixtures；
- Bangkok 四张本地照片、地球/Else 参考资产；
- canonical router 的分段参数解析思路；
- 旧版页面覆盖范围与部分业务动作名称；
- `AppViewport`、`Fragment Lens`、`Else 单实例`、`世界/发现/我的`产品边界。

旧版代码只作为行为对照，不作为继续扩建的架构基础。

## 5. 决策

采用 canonical 目录内的干净 vanilla 重建：

- DOM 负责真实原件、文字、表单、可访问交互；
- 单个 Three.js Canvas 负责地球、点云骨架、关系光流与空间深度；
- SVG 负责可理解的关系线；
- GSAP 只通过统一 flow controller 编排路由、证据显影、Flip 与 ScrollTrigger；
- 所有页面从只读统一索引取数；
- 所有写操作通过 action/store；
- 所有交互通过事件委托与 controller；
- 无 WebGL、reduced motion、reduced data 和低性能档保持完整功能。

## 6. 已知素材限制

真实缺失资产包括 receipt、ferry ticket、map screenshot、menu、market、Chiang Mai 和 Tokyo 原件。实现将按 fixture 显示媒介比例、已知 OCR/时间/地点和“原件待补”，不会生成或伪装为用户真实原件。Bangkok 之外的城市以点云、事实计数和明确待补节点呈现。

