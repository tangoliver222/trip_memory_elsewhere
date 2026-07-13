# Elsewhere 最终全页面视觉与行为审计

日期：2026-07-14
基准：四张用户参考图 + `reference-bar-2026-07-14.md`

## 审计方法

- 390px：全部路由首屏；可滚动页面另取 58% 中段。
- 430px：九个核心代表页复核。
- 768 / 1440：全部路由健康、溢出、断图和关键交互检查。
- reduced motion：全部路由与关键交互检查。
- 每页检查单 Canvas、Else 可见性、无内部 ID、无运行时错误、无横向溢出。
- 所有核心页逐张与用户参考比较；S/A ≥9.0，B/C ≥8.0。

## 路由结果

| 路由 / 状态 | 强度 | 视觉结论 | 行为结论 |
|---|---:|---|---|
| `/onboarding` | A | 深场入口与大标题成立 | 单主操作通过 |
| `/onboarding/permissions` | C | 黑底工具层安静清楚 | 权限边界通过 |
| `/onboarding/first-import` | B | 混合原件拼贴完整 | 单入口通过 |
| `/onboarding/processing` | B | 轨道与阶段状态清晰 | 进度来源通过 |
| `/onboarding/first-connection` | A | 两端证据和关系脊柱成立 | 证据先于解释 |
| `/world` | S | 电影级银白点云地球与拓扑 | 拖拽、缩放、城市进入通过 |
| `/world/cities` | A | 同一地球场延续，缺失原件诚实 | 城市入口通过 |
| `/world/city/:cityId` | S | 多层真实原件碎片场 | Capsule / Explore 入口通过 |
| `/world/fragments` | S | 多深度私人数据库 | 搜索、惯性、Lens、恢复通过 |
| `/world/import` | B | 环形混合媒介入口 | 批次边界通过 |
| `/world/inbox/receipt/:batchId` | A | 分流空间而非统计卡片 | 结果计数通过 |
| `/world/inbox` | B | 一次一判断的证据比较 | 选择行为通过 |
| `/world/city/:cityId/capsule` | S | 摄影书章节与用户文字 | ScrollTrigger 章节通过 |
| `?view=time` | A | 日期脊柱与错层原件 | 场景详情入口通过 |
| `?view=place` | A | 来源地点记忆地图 | 地点详情入口通过 |
| `?view=connection` | A | 关系节点、开口状态、来源数 | 连接详情入口通过 |
| `/world/scene/:sceneId` | A | 原件与时间桥先行 | 权威事实通过 |
| `/world/place/:placeId` | A | 到访锚点与次数结构 | 三次访问来源通过 |
| `/world/connection/:connectionId` | A | 证据—关系—缺口分层 | 确认/分开通过 |
| `/discover` | S | 单次发现主导、非信息流 | 筛选与入口通过 |
| `/discover/:discoveryId` | S | 三日期→关系→实体→标题 | Lens、保存、分享通过 |
| `/me` | C | 私人世界身份与设置组统一 | 全工具入口通过 |
| `/me/writing` | B | 用户文字时间轨 | 写作详情通过 |
| `/me/writing/:noteId` | C | 长文本稳定克制 | 编辑状态保留 |
| `/me/privacy` | C | 读取边界图与开关清楚 | 设置状态通过 |
| `/me/preferences` | C | 三种事实语气可比较 | 不虚构事实 |
| `/me/storage` | C | 原件/派生/缓存分层 | 缓存影响通过 |
| `/me/export` | C | 导出、分享、删除分区 | 隐私默认与删除影响通过 |

## 叠层与角色状态

| 叠层 / 状态 | 结果 |
|---|---|
| Fragment Lens | 从空间节点提取；背景保留；关闭恢复搜索、相机、滚动和焦点 |
| Original Viewer | 原件全屏权威；返回 Lens 链路通过 |
| Share Preview | 金额、精确地址、私密笔记默认隐藏 |
| Delete Confirmation | 删除前列出城市、场景、关系、发现四类影响 |
| Else 五状态 | 一个 Orb 移入抽屉；来源、缺口和下一步可追溯 |
| WebGL fallback | 静态 Memory Scene 可见；主操作保持启用 |

## 不接受结果复核

- 不是少量背景点：通过。
- 不是圆角卡片中的普通点云地球：通过。
- 页面切换不是 fade-only：通过。
- Field 不是二维卡片墙：通过。
- Discovery 不是纵向证据列表：通过。
- Else 不是复制角色的聊天浮窗：通过。
- 后续页面没有退化为通用 Dashboard：通过。
- 工具页克制没有降低 S/A 页强度：通过。

## 已知事实边界

演示包只包含四份可验证的 Bangkok 代表照片。票据、船票、菜单、地图截图和其他城市代表原件仍以 `SOURCE / PENDING` 明示，不会生成伪造原件来换取视觉丰富度；替换真实资产后布局可直接承载。
