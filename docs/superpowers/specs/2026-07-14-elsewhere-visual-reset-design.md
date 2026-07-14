# Elsewhere 语义粒子视觉重置设计

## 目标

把冻结版本从“DOM 页面 + 全局星点背景”重构为同一个私人记忆世界的连续形态变化：真实原件承担内容，Three.js 粒子承担地球、城市群、时间、地点、关系和状态，GSAP 按证据逻辑控制显影。

## 方案选择

### 方案 A：保留现有场景，只重写 CSS

可以快速去金色、缩标题和修卡片，但无法让粒子读取对象坐标，也无法建立 World → City → Timeline → Place → Discovery 的空间连续性。拒绝。

### 方案 B：每页建立独立 Three.js 场景

单页更容易做强视觉，但会产生多个 Renderer、重复资源、切页黑场和 Else 脱离主世界的问题。拒绝。

### 方案 C：单 Renderer + Scene Definitions + Anchor Registry

保留一个 App 级 Renderer 和粒子池；每个路由使用独立 Scene Definition；页面原件通过 DOM anchor registry 提供真实坐标；场景只改变目标几何、可见粒子范围、相机和语义流。采用。

用户的重置提示已经明确授权按此架构自主执行，故不再增加重复审批停顿。

## 视觉语法

- 根背景 `#040506`；正文白、银灰、冷灰；低饱和暖灰仅用于用户确认或用户文字。
- S/A 页面只在对象或路径附近出现粒子；B 页面限制在当前任务对象周围；C 页面 active particle count 为 0。
- 不使用持续 blur、金色系统色、均匀星点、通用玻璃卡堆叠、随机旋转原件和大面积空占位框。
- 大标题只在 World/City 等确有空间主叙事的页面出现，并保持锐利；工具页标题回到功能字号。
- 缺失真实原件时减少 DOM 节点或使用明确的未闭合粒子壳，不生成假票据、假照片或假地图。

## 场景架构

### Scene Definition

`scene-definitions.js` 为每个 mode 提供稳定配置：

```js
{
  mode,
  generator,
  activeCount,
  anchorSelectors,
  depth,
  camera,
  palette,
  interaction,
  idle,
  duration,
  reducedMotion
}
```

`MemorySceneManager.transitionTo(definition, payload)` 负责：读取 anchor、生成目标、设置 active range、更新相机/交互/色板、运行单一 GSAP flow，并在 target 与主 timeline settled 后解析 Promise。

### Anchor Registry

DOM 原件和实体必须带有以下一种或多种属性：

```text
data-fragment-id
data-scene-id
data-place-id
data-connection-id
data-particle-anchor
```

`AnchorRegistry.measure(root, camera, viewport)` 在 render、resize、搜索聚焦和 Lens 状态变化后读取 `getBoundingClientRect()`，将中心点转换为 NDC，再投影到指定 Three world depth。生成器只能连接 registry 中存在的语义 anchor，不使用固定 SVG 假坐标作为主关系。

### 粒子池

粒子池继续复用一个 BufferGeometry，但增加 active/visibility 与 group 属性。Tool 模式 activeCount 为 0；其他模式只点亮定义所需范围。目标位置稳定，noise 只保留极小呼吸，不改变可辨形态。

至少实现并单测：

- `createGlobeTargets`：大陆高密度、海洋极低密度、城市脉冲；
- `createCityClusterTargets`：围绕真实原件 anchor 的 2–3 个场景群；
- `createMultiCityFieldTargets`：三个不同深度城市核心，缺素材城市使用未闭合壳；
- `createTimelineTargets`：稳定纵向时间脊柱与日期支线；
- `createPlaceMapTargets`：依据 Bangkok 经纬度归一化到地图坐标；
- `createConnectionTargets`：使用 from/to anchor 的状态路径；
- `createDiscoveryTargets`：日期证据 → 关系 → 共同实体；
- `createElseOrbTargets`：idle、reading、found、uncertain、conflict；
- `createImportBatchTargets`：只围绕导入批次对象分流。

## 五个标杆页

### World Home

地球占据首屏主要空间，亚洲大陆轮廓可辨，背景几乎无散点。Bangkok、Chiang Mai、Tokyo 使用真实经纬度投影。标题锐利。地球下方同页提供四个入口：最近城市、安放新碎片、碎片收件箱、全部碎片数据库。点击 Bangkok 时先转向并释放短粒子流，再进入 City，不黑屏。

### City World

使用四张现有 Bangkok 真实照片，按 Ari、River、Old Town 三个 scene/place/time 群组织；删除“照片原件”重复标签和随机旋转。粒子只围绕群核心与关系路径出现。Capsule 和 Explore 以场景出口表达，不复制同款黑卡。

### Fragment Field

第一视野显示 Bangkok、Chiang Mai、Tokyo 三个深度群。Bangkok 承载真实原件；另两座城市只显示粒子壳和事实标签，不伪造原件。搜索 Common Grounds 后 Bangkok/Ari 群回到中心，无关群降低 opacity、scale 并增加远景 depth。选中原件时周围空间降噪，Lens 从原 anchor 提取。

### Discovery Detail

进入时完整标题隐藏。先出现三个日期节点：真实照片直接展示；缺失票据只显示来源记录/未闭合粒子壳，不渲染空黑卡。粒子路径读取三个证据 anchor 与 Common Grounds entity anchor；共同实体形成后，标题锐利显影；“为什么显影”和操作位于安全区内。

### Inbox

390px 首屏同时显示待确认来源、已确认照片、未闭合关系、最多三条证据和“是 / 不是 / 稍后”。缺失交通截图用紧凑的 OCR 来源记录而不是巨型空卡。粒子只存在于两对象之间的缺口。

五页分别输出 `pass-0`、`pass-1`、`pass-2`。每轮记录最多五个视觉差异；pass-2 不满足硬规则时继续迭代，不扩散到其他页面。

## 其他页面扩散规则

- Timeline：纵向日期脊柱；原件贴日期；取消随机波形。
- Places：真实 Bangkok 坐标归一化；名称贴节点；访问次数由密度/轨道表示。
- Connections：节点与路径读取 anchor；confirmed、supported、unresolved 使用闭合度区分。
- Discover Home：一屏一条发现，关系缩略场先于标题。
- Capsule：每章原件先显影，时间/地点粒子连接，观察后出现，章节间黑场。
- Lens：从选中 anchor 提取，首屏只回答是什么、属于哪里、为什么重要。
- Else：银灰单 Orb；读取当前页来源；打开时同一实例移入标题区。
- Onboarding/Import/Receipt：只围绕真实导入对象凝聚或分流。
- Privacy/Storage/Preferences/Export/长文本编辑：active particle count 为 0。

## 稳定截图协议

每次 route render 立即设置：

```js
window.__ELSEWHERE_VISUAL_READY__ = false;
document.documentElement.dataset.visualReady = 'false';
```

等待字体、当前页面图片、DOM anchor 测量、Three target、主 GSAP timeline 完成后，统一设置为 true。Playwright 正式基准必须等待该状态后再等待 150ms；`animation-start` 与 `animation-mid` 只作为调试证据。

## 失败与性能

- WebGL context loss 继续显示静态语义后备，不能恢复成星空。
- reduced-motion 直接到 settled target，仍保留对象关系。
- 维持单 Renderer、单 Canvas、单粒子池；最多一条主 timeline。
- 390px、430px、768px、1440px 和 reduced-motion 均需无横向溢出和关键区域裁切。
- 视觉完成必须同时满足：稳定截图、真实交互、DOM anchor 数量/坐标测试、工具页零粒子、五页 pass-2 人工截图检查。

## 规范自检

- 无 TBD、TODO 或待决定项。
- 单 Renderer 与不同 route geometry 不冲突。
- 参考图的视觉标准与演示包的真实数据边界已分离。
- 五个标杆页先冻结、其他页面后扩散的顺序明确。
