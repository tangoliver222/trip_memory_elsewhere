# Elsewhere 全产品视觉重构实施计划 v5

**分支：** `claude/elsewhere-visual-rebuild-v5`（基于 `codex/elsewhere-full-visual-rebuild` @ `b634e62`）
**日期：** 2026-07-14
**上位文件：** CLAUDE_ELSEWHERE_MASTER_VISUAL_REBUILD_PROMPT.md → ELSEWHERE_VISUAL_REPAIR_v5.md → golden references → PRD v3.0 → Visual System v3.0 → PAGE_LOGIC_MAP v1 → AGENTS.md

---

## 0. Golden Visual References 绑定记录

参考图已入库：`design-reference/golden-v5/`

| 文件 | 对应页面 | 锁定的构图要素 | 不复制的内容 |
|---|---|---|---|
| `world-home.png` | World Home | 顶部品牌条（72–88px）；大点云地球占上半屏、大陆由密集银灰点组成、三个城市锚点带标签与垂线；左侧世界统计（places/countries/memories）；地球下方 01–04 四个入口卡（推荐城市带真实照片缩略、放入碎片、收件箱带待确认数、全部碎片），每卡左侧有微型粒子构图；珍珠银 Else orb 吸附右下；底部导航 | 虚构数据（142 places / 8,947 memories）、英文栏目名照抄、汉堡菜单 |
| `city-home.png` | World City Home | 左上城市名衬线大字+坐标+一句观察；中部为混合媒介碎片自由悬浮群（照片、小票、手写便签、地图块、票根、波形块）沿一条 S 形粒子流分布，远景碎片模糊形成景深；碎片带小型侧标签；下缘 CITY CAPSULE 主 CTA + insight 条 | SRT 票、语音波形等虚构对象照抄；"MARKET ENERGY" 等标签文案 |
| `fragment-field.png` | World Fragments | 深空多城市碎片星团（每团一个城市标签+碎片数）；粒子流从选中碎片汇入 Fragment Lens 卡；左上标题+总数+同步状态；左下视图切换 pill；右下 Else 珍珠 | 六个虚构城市与虚构数量；Lens 内 "Meaning" 文学化文案 |
| `discover-detail.png` | Discover Detail | 证据圆形节点围绕中心光核，粒子流从各证据汇入中心；每个证据带序号、类型、时间与引用；标题在右上以取景框形式显影；下方 WHY THIS DISCOVERY 单列解释条 | 5 个证据的虚构内容；圆形裁剪不强制（保持原件矩形也可） |
| `inbox.png` | World Inbox | 顶部 FRAGMENT INBOX 小标 + 28–32px 标题 + 明确问题；两张原件并排同屏（小票纸质感 + 照片），中间以粒子点线连接并带 "?"；EVIDENCE 列表（时间/文字/地点 + 置信度 High/Medium）；No / Not sure / Yes 三个操作固定于导航上方 | HØLME COFFEE 虚构商户；置信度百分比（用 高/中 词汇） |
| `discover-detail-cn.png` | Discover Detail（中文版语言基准） | 中文文案的克制风格："为什么显影"、"原件轨道"、事实性证据行 | Tokyo Ari Coffee 的虚构数据 |

**全局锁定：** 黑场 ≥ 70%；粒子为银灰白（#f2f3ef→#848d92），无金色；空间深度靠粒子尺寸/模糊/密度渐变表达；文字锐利无模糊稳定态；真实碎片是主角，粒子是骨架。

---

## 1. 工程审计

- **真正运行中的 vanilla 项目：** `design-lab/prototypes-vanilla/`（vite + three@0.180 + gsap@3.13 + @playwright/test，`npm run dev`）。根目录是 AI Studio React 壳（仅预览用，本轮不动）；`design-lab/elsewhere-frontend-v1/` 是旧版原型（不动）。
- **路由：** 27 条路由全部在 `page-manifest.js` 有契约（pageId/space/density/intensity/sceneMode/purpose/primaryAction/elseScope），`router.js` 可匹配动态段。全部可运行。
- **单 Renderer：** 已满足——`MemorySceneManager` 只在 shell 首次挂载时创建一次 renderer，路由切换仅换 target。保留。
- **未定义函数 / 错误 ID 绑定：** 未发现；事件通过 `action-controller.js` 事件委托绑定 `data-action`，无内联事件访问私有变量。
- **外部 CDN：** 无。字体用系统栈 + Georgia。
- **缺失素材：** 大量碎片 `asset: null` + `requiredAsset`（小票/船票/菜单/截图/清迈东京照片）。旧实现渲染为空 Pending 卡（违禁）。本轮改为 **DOM 工艺化原件**：小票=纸面+OCR 文字、票根=齿孔纸条、地图=SVG 简化地图块、菜单=纸面文字，不伪造照片，数据可回源。
- **截图动画中间态：** 旧截图在 CSS animation 进行中捕获（discover-detail 的 blur 稳定态问题）。本轮实现 `window.__ELSEWHERE_VISUAL_READY__` + `data-visual-ready`，Playwright 等待后截图。
- **底部导航遮挡 / 横向溢出：** 旧测试已断言 scrollWidth===clientWidth；保留并在每页 pass 中复验；Inbox 操作条需固定在导航上方。

## 2. 数据审计

- 城市 3（Bangkok 63 碎片/11 地点；Chiang Mai 28/7；Tokyo 81/14）；世界总量 172 碎片 / 14 连接。
- 碎片 fixture 9 条（全部 Bangkok，4 条有真实图片资产）；地点 4；场景 5；连接 5（confirmed 3 / suggested 1 / unresolved 1）；发现 3（new/supported/unresolved 各 1）；批次 1；待判断 2；处理中 1；异常 1；用户书写 4。
- 页面数据来源统一为 `fixtures/data.js` + `selectors.js`，无同对象跨页不一致；无重复图片冒充不同日期（4 张照片各属一个场景）。
- Tokyo / Chiang Mai 无碎片级数据 → Fragment Field 中作为**粒子聚类 + 城市标签 + 真实计数**呈现（感知完整而非渲染完整），不伪造缩略图。
- 世界统计沿用 fixture 真值（3 城 / 172 碎片 / 14 连接），不采用参考图虚构数字。

## 3. 视觉审计（对照 mobile-390 before 基线）

逐页核心问题（before 截图存 `artifacts/screenshots/before/`）：

| 页面 | 问题 |
|---|---|
| World Home | 全屏星空感；地球是无大陆随机球；金色 eyebrow/CTA/Orb；巨型衬线品牌标题占 1/3 屏；五入口缺三个（无放入碎片/收件箱/全部碎片入口）；无推荐城市原件卡 |
| City Home | 旋转照片海报 + 重复"照片原件"标签；无三聚类结构；无粒子骨架；入口卡是普通黑卡 |
| Fragments | 单城市浅层平面；无多城市群；有空 Pending 卡；搜索无聚集心流 |
| Discover Detail | 标题 blur 显影但证据卡为空黑块（票据无资产）；金色关系线 |
| Inbox | FERRY 水印空占位卡；两证据不能同屏比较充分；金色按钮描边 |
| 全局 | `--memory-warm #d8b16c` 金色系统性污染（eyebrow/开关/节点/线）；shell 背景射线渐变偏蓝绿；工具页仍有粒子层 |

## 4. 实施顺序

1. **工程修复 + 全局归零（Phase 2）**：tokens 重置为黑/深灰/银灰/暖灰（v5 §2.1 起点色板）；删除金色；字体层级（沉浸 42–54 / 城市 34–42 / 功能 26–32 / 正文 15–17 / 元数据 12–13）；`__ELSEWHERE_VISUAL_READY__`；DOM 工艺化原件组件（receipt/ticket/map/menu/note）。
2. **Three.js 场景重构（Phase 3）**：
   - `particle-targets.js` 全部重写为语义几何：`globe`（采样 earth-topology.png 陆地掩膜 → 真实大陆点云 + 城市锚点）、`cityCluster`（三聚类对齐 DOM 锚点）、`multiCityField`（三城市群+未安放区，深度分层）、`timeline`、`placeMap`、`connection`、`discovery`（证据节点→中心收束+流线）、`elseOrb`、`importBatch`（流入束）、`inboxDecision`（两证据间断裂/闭合线）。
   - `scene-manager.js` 增加 `transitionTo({mode,targets,anchors,...})`、DOM 锚点投影（getBoundingClientRect → NDC → 世界坐标）、pointer uniform、二次进入 0.6–1.0s 快速重组。
   - shader：新增 `uFocus`/`uPointer`/`uCluster` 支持；warm 色改 `#b8ad9b`（低频暖灰确认色）。
   - 性能：high 12k / balanced 7k / low 2.5k，DPR 限制照旧；工具页 `quiet-tool` 停帧渲染一次后暂停。
3. **五个标杆页（Phase 4，顺序固定）**：World Home → City Home → Fragments → Discover Detail → Inbox；每页 pass-0 截图 → 列 5 差异 → 修 → pass-1 → 再修 → pass-2 final；截图存 `artifacts/screenshots/pass-{0,1,2}/`，审查写 `docs/visual/visual-pass-*.md`。
4. **其余页面（Phase 5）**：onboarding 5 页、import/receipt、capsule、explore(time/place/connection)、scene/place/connection detail、discover home、lens/viewer、else、writing、me、privacy/storage/export/preferences——按主提示 §11 要求；工具页粒子关闭或 idle 单帧。
5. **GSAP 心流（Phase 6a）**：flow-controller 扩展 worldEnter/globeFocusCity/globeToCity/cityToExplore/fragmentFieldSearch/fragmentFieldFocus/lensOpen(Flip)/lensClose/discoveryReveal/inboxConfirm/inboxReject/elseOpen/elseReading/elseFound/capsuleChapterReveal；心流顺序恒为 原件→时间地点→连接→共同实体→观察→操作→用户解释。
6. **性能与降级（Phase 6b）**：document.hidden 暂停（已有）、context lost fallback（已有）、reduced-motion 全量、performance-report.json 重跑。
7. **视觉回归与交付（Phase 6c）**：Playwright 断言（无 console error、无横向溢出、导航不遮挡、Else 单实例、canvas 单实例、visual-ready 后截图）；`docs/visual/final-page-audit-v5.md`、`docs/visual/final-handoff-v5.md`。

## 5. 不可妥协验收清单（终检对照）

World Home 五入口齐备；地球有可辨大陆与准确城市点；City Home 三聚类混合媒介；Fragment Field 多城市 + 4 级 LOD + 搜索聚集；Discover Detail 证据先于标题；Inbox 两证据同屏可判；无金色主题；无全局星空；无模糊稳定态文字；无空 Pending 卡；DOM 与粒子有锚点联系；五标杆页 pass-0/1/2 齐全；reduced-motion 完整。
