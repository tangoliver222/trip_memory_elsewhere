# Elsewhere 粒子与全页面视觉校准 · Pass 1

日期：2026-07-14  
验收基准：`docs/visual/reference-bar-2026-07-14.md` 与用户提供的四张典型页面参考图。

## 本轮结论

本轮不是在暗色页面上增加背景点，而是把同一粒子池改造成 World、City、Field、Explore、Discovery、Lens 与 Else 共用的空间骨架。所有路由均在 390px 真机比例下生成首屏截图；长页面另取 58% 滚动位置复核。自动检查同时覆盖单 Canvas、横向溢出、断图、控制台异常、内部 ID 暴露和 Else 单实例。

参考图带来的关键修正：

- 主粒子由暖金、大光斑改为银白、细颗粒；暖色只保留给事实成立、确认动作和少量状态脉冲。
- World 加入可辨识但低对比度的地球拓扑，仍由点云凝聚主导；OrbitControls 只接管 Canvas，不劫持页面按钮。
- City World 的真实原件从重叠堆栈改为四层空间散布，入口固定在视野底部，页面不再是标题加卡片。
- Fragment Field 在手机上使用九个语义锚点和多级 Z 深度；搜索仍将相关碎片回流中心，缺失原件保持明确标记。
- Timeline、Places、Connections 改为三种不同空间结构，不复用卡片墙。
- Discovery 的标题按参考图置于首屏上方，但仍延迟到关系形成后显影；DOM 与无障碍顺序继续保持“证据先于标题”。
- Lens 改为从原空间提取后的悬浮可读面板，四周保留原场景深度；跨路由会关闭叠层并复位阅读位置。

## 粒子参数变更

| 参数 | 调整前 | Pass 1 | 语义原因 |
|---|---:|---:|---|
| point size | 2.4 | 1.35 | 从光斑改为银盐般细点，支持高密度而不糊成雾 |
| scale range | 0.35–1.70 | 0.24–0.96 | 建立远近层次，避免所有粒子同样抢眼 |
| perspective clamp | 0.4–4.0 | 0.38–1.85 | 限制近景巨点，保留纵深而不产生廉价散景 |
| max point size | 12px | 5px | 与参考图的细密颗粒持平 |
| cool color | `#8ca8ae` | `#d8e0de` | 主体改为银白记忆尘埃 |
| warm frequency | 约 1/19 强暖色 | 约 1/71 柔暖色 | 暖色只表达确认与显影，而非铺满背景 |
| opacity | 0.90 | 0.84 | 让真实原件和文字保持前景权威 |
| globe radius | 12 | 10.8 | 给标题、城市点、CTA 和 Else 留出稳定呼吸区 |

性能配置仍保持：low 3,000、balanced 7,200、high 9,800 粒子；DPR 上限 1.5；单 renderer、单 particle pool。

## 全页面评分

评分维度统一为：空间密度、原件融合、构图、材质细节、关系可读性。S/A 需 ≥9.0，B/C 需 ≥8.0。

| 页面 / 状态 | 强度 | 分数 | 验收摘要 |
|---|---:|---:|---|
| Onboarding Intro | A | 9.0 | 深场先于文案，入口明确 |
| Permissions | C | 8.4 | 几乎无粒子，权限边界清楚 |
| First Import | B | 8.7 | 原件拼贴与单主操作成立 |
| Processing | B | 8.6 | 轨道状态可读，不伪装进度事实 |
| First Connection | A | 9.0 | 两端原件与时间关系同屏 |
| World | S | 9.3 | 银白点云地球、城市亮点、三维拖拽与首屏 Wow |
| Cities Index | A | 9.0 | 同一地球场延续；缺失代表原件有诚实的空间占位 |
| City World | S | 9.2 | 四层真实原件场与持续粒子空间 |
| Fragment Field | S | 9.1 | 九节点多深度数据库、搜索回流、缺失来源显式 |
| Import | B | 8.4 | 克制入口、环形来源场与清晰批次信息 |
| Import Receipt | A | 9.0 | 保存结果向城市、地点、关系和待判断分流 |
| Inbox | B | 8.5 | 一次一判断，原件比较优先 |
| City Capsule | S | 9.1 | 摄影书章节、真实原件与用户文字共同主导 |
| Timeline | A | 9.2 | 日期脊柱、错层原件、粒子时间流 |
| Places | A | 9.0 | 来源地点在记忆地图中定位，非通用地图卡片 |
| Connections | A | 9.1 | 状态节点、开口关系与来源数量清晰 |
| Scene Detail | A | 9.0 | 原件与 17 分钟关系先于说明 |
| Place Detail | A | 9.0 | 到访锚点与三次来源结构明确 |
| Connection Detail | A | 9.0 | 证据、关系与缺口保持分层 |
| Discover Home | S | 9.1 | 单次显影主导而非信息流 |
| Discovery Detail | S | 9.3 | 三日期纵深、关系生长、实体凝聚、延迟标题 |
| Fragment Lens | B | 8.7 | 从空间提取、场景退后、可读面板与反向返回 |
| Original Viewer | B | 8.5 | 原件全屏权威，无装饰干扰 |
| Else idle / reading / found / uncertain / conflict | S | 9.1 | 单 Orb 移位，五种粒子闭合状态可区分 |
| Me | C | 8.6 | 安静工具层仍保持专属世界身份 |
| My Writing | B | 8.6 | 时间轨与用户原文优先 |
| Writing Detail | C | 8.4 | 长文本编辑稳定、低动效 |
| Privacy | C | 8.5 | 读取边界与控制项清楚 |
| Preferences | C | 8.3 | 三种叙述方式可比较、不虚构事实 |
| Storage | C | 8.4 | 原件、派生数据、缓存影响清晰 |
| Export / Delete | C | 8.5 | 不可逆影响先于确认 |
| Share Preview | B | 8.5 | 默认隐藏金额、精确地址和私密笔记 |

## 证据

- 核心参考截图：`design-lab/prototypes-vanilla/artifacts/screenshots/pass-1/`
- 全路由本地审计：`design-lab/prototypes-vanilla/artifacts/screenshots/all-pages/`（生成物，不纳入 Git）
- 全路由联系表：`design-lab/prototypes-vanilla/artifacts/contact-sheets/all-pages-mobile-390.png`（生成物，不纳入 Git）
- Playwright 用例：`tests/e2e/routes.spec.js`、`interactions.spec.js`、`visual.spec.js`、`visual-all.spec.js`

## Pass 2 关注项

- 在真实浏览器记录 renderer / timeline / context loss 与页面恢复。
- 对路由 churn、后台暂停、上下文恢复和性能档位做最终测量。
- 录制六个标志性转场视频，并在最终审计中复核所有页面首屏与长页面中段。
