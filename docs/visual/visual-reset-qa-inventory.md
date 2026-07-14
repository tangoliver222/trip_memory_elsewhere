# Elsewhere 视觉重置 QA Inventory

## 用户可见主张

| 主张 | 功能检查 | 视觉状态 | 证据 |
|---|---|---|---|
| 粒子形成对象而非星空 | route 后读取 scene debug 的 mode/activeCount/anchorCount | 五个标杆页 settled-final | pass-2 截图 + debug JSON |
| World 是清晰亚洲点云地球 | 拖拽、缩放、点击 Bangkok | 初始与点击后中间态/终态 | World pass-2 + transition video |
| World 有四个任务入口 | 逐一点击并核对 route | 390px 首屏/首屏下沿 | World pass-2 |
| City 是三组真实原件空间 | 点击 Capsule/Explore，原件可开 Lens | City settled-final | City pass-2 |
| Field 是三深度城市群 | 搜索、拖拽、缩放、选中、关闭 Lens | 默认、搜索、Lens、返回 | Field pass-2 + video |
| Discovery 先证据后结论 | 检查显影阶段与标题 ready 时刻 | start、mid、settled | Discovery 三阶段截图 + video |
| Inbox 同屏可判断 | 是/不是/稍后完整操作 | 390px 初始首屏 | Inbox pass-2 |
| Timeline/Places/Connections 是不同结构 | 切换三个视角 | 三个 settled-final | 各视图截图 |
| Lens 从原位置提取并返回 | 搜索后开关 Lens | 打开与关闭后 | video + snapshot 断言 |
| Else 五状态来自当前来源 | idle→reading→found/uncertain/conflict | 每状态 settled | 状态截图/测试 |
| 工具页安静 | 检查 activeCount=0 | Privacy/Storage/Preferences/Export | debug + 截图 |
| 正式截图没有 blur 中间帧 | 等待 visual-ready | 所有正式基准 | computed-style 断言 |

## 控件与状态

- World：Canvas 拖拽、滚轮缩放、三个城市点、最近城市、安放碎片、Inbox、全部碎片。
- City：Capsule、Explore、四个真实原件、返回世界。
- Field：搜索、类型筛选、拖拽、缩放、节点、Lens、Original Viewer、关闭恢复。
- Discovery：来源节点、保存、分享、返回。
- Inbox：是、不是、稍后、返回全部碎片。
- Explore：时间、地点、连接以及对应详情入口。
- Else：Orb、建议问题、来源、下一步、关闭。
- Me：写作、隐私、偏好、存储、导出及各状态开关。

## 脆弱场景

1. 在 Common Grounds 搜索结果中打开 Lens，切到 Original Viewer，再逐层返回；必须恢复搜索、相机、焦点和节点位置。
2. 在 World 入场动画结束前触发 reduced-motion 或 route 切换；旧 timeline 必须终止，新的 route 最终仍能到达 visual-ready。
3. WebGL context loss 后点击当前页主动作；页面仍可导航，后备图不覆盖交互。
4. 390px 高度缩短到 700px；Inbox 三个动作和底部安全区不得被导航遮挡。
