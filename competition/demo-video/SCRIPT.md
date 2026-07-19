# Elsewhere competition demo narration

## Beat 1 — Hook

旅行结束以后，照片、小票、截图和随手写下的文字，通常会散落在不同应用里。
Elsewhere 想做的，不是再建一个旅行相册。
它把真实原件重新组织成一座可以进入、搜索和追问的私人记忆世界。

## Beat 2 — Real input

演示从八个真实文件开始。用户选择照片、票据、地图截图和文字，浏览器先取得 Firebase 匿名身份与
App Check 证明，再把原始字节直接保存到受规则保护的 Cloud Storage。批次、原件和处理状态进入
Firestore；页面没有预先写死这次导入的数量和结论。

## Beat 3 — Deterministic first

在 Elsewhere，AI 永远不是第一步。Storage finalized 事件通过 Eventarc 进入独立的 Cloud Run ingestion
服务。系统先完成格式、哈希、元数据、缩略图和重复判断，再由权威 Routing 与 Budget Gate 决定哪些能力
值得执行。只有这张小票被批准进入 Cloud Tasks 和 Google Document AI；普通照片不会无条件消耗模型。

## Beat 4 — One memory world

处理完成后，同一份持久化数据开始改变空间。世界页不再显示固定的三座城市，而是这次导入产生的一座
Bangkok 和八个碎片。进入城市，Common Grounds、河岸和待确认地点形成不同记忆团块。照片、小票与地点
不是贴在粒子背景上；它们本身就是粒子聚类和连接路径的锚点。

## Beat 5 — Search and source

在 Fragment Field 里，每个真实原件都是可搜索的空间节点。搜索 Common Grounds，相关碎片向中心回流，
无关内容退入远景。打开 Fragment Lens，可以回到原始图片、时间、地点、确定性处理轨迹，以及持久化的
Document AI 摘录。每个结论都保留来源，不把推断伪装成事实。

## Beat 6 — Discovery grows

发现也不是先给一个醒目的标题。十月十二日、十六日和十九日的三个原件先出现；时间和共同地点建立关系；
最后，三个早晨都从 Common Grounds 开始，才作为一条发现显影。用户看到的不只是答案，而是答案如何从
证据中长出来。

## Beat 7 — Else, with boundaries

Else 不是悬浮聊天框。它读取当前记忆范围，回答“我反复去过哪里”，先直接回答，再列出可以打开的原始来源，
最后说明仍然不确定的边界。这次回答由 Gemini 生成，但 Gemini 只能使用已经批准、可验证的来源；它不能绕过
Routing Layer 自行调用更多付费能力。

## Beat 8 — Proof and close

这条演示链已经通过真实 Google Cloud 验证：Firebase Auth、App Check、Firestore、Storage，Eventarc，
三个隔离身份的 Cloud Run 服务，Cloud Tasks，Document AI，以及一次带来源的 Gemini 回答。
公开评审版部署在 Firebase Hosting。

Elsewhere。让旅行不只被保存，而是重新相连。
