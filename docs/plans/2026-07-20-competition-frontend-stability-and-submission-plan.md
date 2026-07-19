# Elsewhere 参赛前端稳定、录屏与提交实施计划

**日期：** 2026-07-20  
**范围：** 只修复真实数据下的前端稳定性、录屏关键路径、公开部署和比赛提交材料；不重新设计页面，不新增产品功能。

## 1. 成功标准

1. Firebase / Google Cloud 后端现状以刚执行的命令为准：三个 Cloud Run 服务 Ready，Cloud Tasks 与 Eventarc 正常，`/readyz` 返回 ready；后端普通测试与 Emulator 测试均为零失败。
2. 真实数据为空、小数据和 8 个演示原件三种状态下，World、City、Fragment Field、Discover、Fragment Lens 与 Else 都不抛异常，不显示 `undefined`、`null`、`[object Object]`、Unicode 替换字符或 mojibake。
3. 390×844 与 430×932 下，录屏关键页满足 `scrollWidth === clientWidth`，主动作、底部导航与 Overlay 不越界。
4. World 地球和城市 pin、City 聚类粒子和真实碎片保持同一滚动坐标系；滚动后一个动画帧内完成同步，不使用 0.9 秒补追动画。
5. Fragment Field 的城市群、粒子权重与未安放区由当前 snapshot 编译，数据数量或城市集合变化时同步变化。
6. 生成 2–5 分钟、由真实产品路径录制的演示视频；构建并实际验证一个公开 Firebase Hosting 链接。
7. 使用 `vibe-submission-collector` 生成规范提交包，技术证据全部落盘；姓名、手机号、组队和授权等不可代填项保持显式缺失，不伪造。

## 2. 页面契约

### World Home

- 所属一级空间：世界
- 对象类型：World / City index
- 页面密度：沉浸型
- 用户上游入口：应用启动、底部“世界”
- 唯一目的：确认私人旅行世界已由当前真实原件形成，并进入最近城市
- 唯一视觉焦点：点云地球
- 证据显影顺序：城市点 → 统计 → 代表原件 → 入口状态
- 唯一主动作：进入最近城市
- 粒子语义：城市与地球数据分布
- 不会修改：当前基线构图、文案语气和导航结构

### World City Home

- 所属一级空间：世界
- 对象类型：City / Fragment cohorts
- 页面密度：沉浸型
- 用户上游入口：World 城市点或最近城市
- 唯一目的：浏览当前城市中由真实碎片形成的聚类
- 唯一视觉焦点：碎片聚类场
- 证据显影顺序：真实碎片 → 聚类名称/数量 → 城市入口
- 唯一主动作：进入 City Capsule
- 粒子语义：粒子围绕当前 DOM 聚类锚点组织并随滚动同步
- 不会修改：当前三团块构图和两个主要入口

### Fragment Field

- 所属一级空间：世界
- 对象类型：Fragment database
- 页面密度：探索型
- 用户上游入口：World“全部碎片”或 City 辅助入口
- 唯一目的：在当前真实数据形成的空间中搜索并打开任一原件
- 唯一视觉焦点：数据驱动的城市/未安放碎片场
- 证据显影顺序：城市群 → 真实原件 → 关系 → Lens
- 唯一主动作：打开 Fragment Lens
- 粒子语义：粒子数量、分区和聚焦均来自当前城市与碎片数据
- 不会修改：现有相机、筛选和 Lens 产品结构

## 3. 根因与最小修复

### 根因 A：真实数据边界未被页面消费端完整处理

`hydrateLiveCollections()` 会合法地产生空城市集合；`renderCityHome()` 却直接读取 `cities[0].slug`。此外，城市聚类仍带有固定 Bangkok fixture 的选择逻辑。结果是数据变化后出现异常、空白或错误位置。

最小修复：

- 在 `src/pages/world.js` 增加明确的空城市页面分支，不以 fixture 冒充真实数据；
- 让 live city route、城市碎片与聚类从同一已重建索引读取；
- 对进入失效城市路由给出稳定返回入口，不抛异常。

### 根因 B：Canvas 固定而 DOM 锚点只测量一次

`#memory-canvas` 固定在 AppViewport，`anchorsFromElements()` 只在 `afterRender` 调用一次，页面滚动后 DOM 坐标改变但粒子目标不变；再次 `retarget()` 又使用 0.9 秒 morph，形成肉眼可见的拖尾。

最小修复：

- 在 `src/visual/scene-manager.js` 增加可清理的 DOM anchor tracker；
- 监听实际滚动容器、ResizeObserver 与帧循环，把锚点变化在下一帧同步到目标；
- 同步更新直接设置 target，不触发记忆显影 morph；首次入场仍保留现有动效；
- World 的 globe stage 同样在滚动/尺寸变化时重新对齐，但保持受限缩放区间。

### 根因 C：Fragment Field 目标几何仍写死城市和数量

`multiCityField()` 固定 Bangkok / Tokyo / Chiang Mai / unplaced 与 63 / 81 / 28 / 10 权重，当前页面虽然 DOM 使用 live collections，WebGL 仍是旧 fixture。

最小修复：

- `renderFragmentField()` 将当前城市、碎片数量、未安放数量编译成 `scenePayload.clusters`；
- `multiCityField()` 只消费该 payload，稳定排序并确定性分配深度和半径；
- 搜索与聚焦继续沿用同一 clusters，不让处理器自行恢复 fixture。

## 4. TDD 阶段

### RED 1 — 数据边界和乱码契约

修改：

- `design-lab/prototypes-vanilla/tests/unit/live-data.test.js`

先写失败测试：

- 空 snapshot 渲染 City route 不抛错并显示稳定空状态；
- live 页面文本不包含 replacement/mojibake/`undefined`/`null`；
- 一城与多城 payload 生成不同 Fragment Field target。

验证：

```bash
npm test -- --test-name-pattern='empty live city|garbled|field particle'
```

预期：测试先因 `city.slug` 异常和固定 `multiCityField` 失败。

### GREEN 1 — 最小数据驱动实现

修改：

- `design-lab/prototypes-vanilla/src/pages/world.js`
- `design-lab/prototypes-vanilla/src/pages/fragments.js`
- `design-lab/prototypes-vanilla/src/visual/particle-targets.js`

验证：目标测试及全部 unit tests。

提交：

```text
fix(frontend): make live memory layouts data driven
```

### RED 2 — 滚动锚点同步契约

修改：

- `design-lab/prototypes-vanilla/tests/unit/visual.test.js`

先写失败测试：模拟聚类元素 `getBoundingClientRect()` 在滚动后变化，断言 tracker 在下一帧重新计算 target、不会调用 0.9 秒 morph，并可清理监听器。

验证：

```bash
npm test -- --test-name-pattern='tracks DOM anchors|realigns world stage'
```

### GREEN 2 / REFACTOR — 同步 tracker

修改：

- `design-lab/prototypes-vanilla/src/visual/scene-manager.js`
- `design-lab/prototypes-vanilla/src/pages/world.js`

验证：目标测试、全部 unit tests、`npm run build`。

提交：

```text
fix(frontend): keep semantic particles anchored while scrolling
```

## 5. 录屏视觉门槛

新增：

- `design-lab/prototypes-vanilla/tests/e2e/recording-visual.spec.js`
- `design-lab/prototypes-vanilla/playwright.recording.config.js`
- `docs/demo/recording-visual-audit.md`

真实导入 8 个 `demo-data/bangkok` 原件后，依次检查：Import、Receipt、World、City、Fragment Field、Fragment Lens、Discover Home、Discover Detail、Else idle/open/result。主视口为 390×844，复核视口为 430×932；每页检查异常文本、横向溢出、必要元素边界、唯一 Else、控制台错误，并在 World/City 初始与滚动后记录截图和锚点偏差。探索性检查包括快速滚动、动画未结束时换页、Field 搜索后开关 Lens。

验证：

```bash
npx playwright test -c playwright.recording.config.js
git diff --check
```

提交：

```text
test(frontend): add recording visual regression gate
```

## 6. 视频、提交包与部署

### 演示视频

- 使用真实演示服务和 8 个原件录制产品路径；
- 用 HyperFrames 仅承担标题、章节、字幕和必要旁白，不重绘产品 UI；
- 生成 2–5 分钟 MP4，并验证时长、分辨率、音轨和关键页面可读性；
- 大文件不提交 Git，放入比赛提交包并生成稳定分享链接。

### 比赛提交包

- 从 `/Users/tangyixuan/Downloads/GDG/GoogleAIVibeathon/vibe-submission-collector.zip` 解包并运行原脚本；
- 包 ID 使用 `elsewhere`；
- `00-submission.json` 是唯一事实源；
- 代码、测试、Cloud Run、Firebase、Document AI、Gemini 与演示证据只写已验证事实；
- 个人姓名、手机号、组队、原创声明与评委访问授权不代填。

### 公开部署

- 构建 production Vite bundle；
- 部署到现有 Firebase 项目 `elsewhere-memory-tyx-2026` 的 Hosting；
- 验证首页、深链、静态资源、主要交互和 `/v1/**` rewrite；
- 若公开静态演示与本地真实导入能力存在边界，在提交材料中如实标注，不把 fixture 描述为在线持久化结果。

验证：

```bash
npm run build
firebase deploy --project elsewhere-memory-tyx-2026 --only hosting
curl -I https://elsewhere-memory-tyx-2026.web.app
```

提交：

```text
docs(demo): add verified competition delivery evidence
```

## 7. 停止条件

以下任一项未通过，不进入视频与提交阶段：

- 录屏路径存在控制台异常；
- 390 或 430 视口横向溢出；
- 滚动后粒子与锚点明显错位；
- live snapshot 改变而 WebGL 分布不变；
- 页面出现错误字符或未定义值；
- World、City、Field、Discover、Else 任一关键路径不可完成。
