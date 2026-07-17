# Elsewhere Authoritative Routing & Budget Gate v1

更新日期：2026-07-17  
状态：Module 4.5 已实现并通过本地与 Firebase Emulator 验证；未部署生产环境，Module 5 未实现。

## 1. 模块位置与完成边界

固定链路为：

```text
Module 3 Original Save
→ Module 4 deterministic-media/v1
→ Module 4.5 fragment-routing/v1 + policy/v1 + cost model/v1
→ Module 5 Capability Executors（本版本不包含）
```

Module 4.5 是权威执行计划编译器，不是建议分类器。它只消费 Source Descriptor、source
revision、SHA-256、dHash、metadata、GPS/时间是否存在、重复候选、最大 512px 的既有缩略图、
批次状态和已持久化结果。它不调用 Document AI、Places、Embedding、Gemini、Qwen、ML Kit
或外部视觉分类 API，也没有引入新的运行时依赖、Cloud Tasks 或生产业务端点。

这里的“零付费 capability 调用”不表示 Cloud Run、Firestore 或 bounded Storage read 没有基础设施
成本。格式与路由校验也不等于恶意内容扫描、文件安全证明或完整语义理解；这些能力不属于
Module 4.5。

## 2. RoutePlan 与两阶段编译

每个 RoutePlan 固定保存：

- owner、Fragment、ImportBatch 与完整 source revision；
- `fragment-routing/v1`、`policy/v1`、`cost model/v1`；
- `deterministic-media/v1` 输入、cohort revision 和用户决定版本；
- 确定性 classification、代表角色与原因；
- OCR、Places、Embedding、Gemini 各自独立的 decision；
- priority、budget class 和可审计 route reasons。

decision 只有 `approved | skipped | deferred | blocked`。`deferred` 必须保存非空
`reconsiderOn`；`approved` 必须绑定 executor class、scope、成本 ceiling 与最大计费尝试数。
不保存另一个 `needsAI` 或 `needsGemini` 布尔事实源。

编译过程：

```text
单个 deterministic terminal event
→ 批次未收敛：保存不可执行 provisional draft
→ 批次收敛：解析 cohort 与代表项
→ 保存 immutable final draft
→ 在一个审批事务中预留预算、批准计划并移动 RoutingHead
```

审批后不原地修改决策正文。输入 generation、policy 或受控 escalation 改变时生成
`revision + 1`，旧计划标为 `superseded`。同一 source revision 最多自动产生 5 个 revision。
RoutingHead 的文档身份不含 generation，因此 source 更新后仍能原子移动 current pointer。

## 3. Cohort 与代表项

v1 支持：

| Cohort | 确定性依据 | 代表规则 |
| --- | --- | --- |
| exact duplicate | 已持久化 SHA-256 candidate | canonical 永远保留为唯一代表 |
| near duplicate | 已持久化 dHash near candidate 图 | 少于 5 项选 1；否则选 2 |
| burst | 同批次、相邻 ≤2 秒、总跨度 ≤15 秒 | 少于 5 项选 1；否则选 2 |
| same time/place | 同批次、可靠时间 ≤10 分钟、双方精度与距离 ≤50 米 | 优先 photo，少于 5 项选 1；否则选 2 |

所有成员与引用使用稳定排序。单 cohort 和 near 图闭包上限都是 200；超限按确定性顺序分片并
记录 `routing/cohort-truncated`。一次审批最多 50 个 RoutePlan，与 ImportBatch 上限一致。
代表选择依次考虑：合法缩略图、非低信息、正常曝光、边缘能量、像素面积、Fragment ID。

`supporting` 仅表示相应昂贵能力可以跳过或复用代表项；原 Fragment 不删除、不隐藏，仍可读、
可导出、参与计数和作为发现来源。cohort 结果不会把 OCR、地点或语义结论无条件复制给成员。

## 4. 确定性路由策略

- exact/near/burst 中的 supporting photo：昂贵能力按代表项规则跳过；
- 带可靠 GPS 的普通照片：Places skipped；Embedding 可批准；
- receipt/ticket/menu/screenshot：OCR 和 Embedding 可批准，Places/Gemini 先 deferred；
- text：OCR skipped，Embedding 可批准；
- PDF：OCR 可批准，但 Module 4 的 `pageCount` 仍为 null，不伪造页数验证；
- 低信息图片：全部 capability blocked；
- deterministic terminal failure：全部 capability blocked；
- feature read 失败：记录 `routing/feature-unavailable`，不得伪造成低信息。

Router 只读取 generation/hash 仍匹配的既有 WebP derivative；text/PDF 不读取像素。处理器信息不足
时只能提交 `escalation_requested`。Router 持久化 EscalationRequest 后才可编译新 revision；
处理器不能自行调用更贵能力。

## 5. 预算门禁

所有金额均使用整数 USD micros。v1 的 admission ceiling 是服务端版本化配置，不是价格承诺：

| Scope | Ceiling |
| --- | ---: |
| user UTC day | 2,000,000 |
| ImportBatch | 1,000,000 |
| RoutePlan | 200,000 |

| Capability | estimated | ceiling | max billable attempts |
| --- | ---: | ---: | ---: |
| OCR | 20,000 | 100,000 | 1 |
| Places | 10,000 | 50,000 | 1 |
| Embedding | 1,000 | 5,000 | 1 |
| Gemini | 25,000 | 100,000 | 1 |

审批在 user-day、batch、route、capability 四个 ledger 同时预留 ceiling。任何 scope 不足时，只将
该能力设为 `blocked/budget-limit`，不把 Fragment 或批次标为失败。settlement 将 reserved 减少
ceiling 并把实际费用加入 spent；无计费失败释放 reservation。

## 6. Module 5 执行授权边界

本版本只实现 provider-free authorizer 和持久化生命周期，不实现 provider adapter。每次 claim
必须同时满足：

- RoutePlan 是 RoutingHead 当前计划且状态为 approved；
- source revision 与当前 head/Fragment 完全一致；
- capability 为 approved，executor class/version 受支持；
- reservation 仍有效且计费 attempt 未超限；
- router、policy、cost model 版本受支持；
- idempotency key 没有产生冲突执行。

生命周期固定为：

```text
claimed → calling → provider_succeeded → completed
       ↘ failed
       ↘ billing_uncertain
```

Provider 成功后先保存不可变 request ID、usage、实际费用和 resultRef，再结算预算并发布结果。
调用已发出但无法证明 provider 是否收费时进入 `billing_uncertain`，禁止自动重调；它需要后续人工
或 provider 对账能力。计划 superseded 后，已获得的调用可以结算审计和预算，但结果不得发布为
Fragment 的当前事实。

## 7. Repository、HTTP 与安全

Memory 与 Firestore 运行同一 routing contract。draft create、审批、head 切换、cohort、预算预留、
execution claim/receipt/settlement 都有幂等或冲突语义。Firestore 暂时故障对外统一降级为稳定、
不泄漏路径的 retryable error。

ingestion 顺序固定为：

```text
original finalizer → deterministic processor → authoritative router
```

拒绝的原件不进入 Module 4/4.5；Module 4 retryable failure 不进入 Router；所有 deterministic
terminal outcome 进入 Router 一次。只有 `drafted | approved | completed | terminal_noop` 成功返回后
Eventarc 才收到 204。Router 持久化失败返回 503，重试正确性不依赖 `Retry-After`。

Module 4.5 不新增 `/routing`、`/route-plans` 或其他生产端点。Firestore Rules 继续允许 owner 读取
Fragment、ImportBatch 和 DuplicateCandidate，同时通过 catch-all 拒绝所有客户端读取或写入
RoutePlan、RoutingHead、RoutingCohort、BudgetLedger、BudgetReservation、CapabilityExecution 和
EscalationRequest。服务端仍依赖 Admin SDK 与独立 ingestion runtime service account。

## 8. 固定规模 fixture

- small：1 个独立、带 GPS 的 photo；
- current：12 个混合 Fragment，包含 3-photo burst、exact pair、near pair、receipt、screenshot、
  text、低信息 photo 和独立 photo；
- large：200 个 Fragment，分属 4 个合法 50 项 ImportBatch，一个 near cohort 正好达到 200 上限。

Emulator 系统测试验证输入反序不改变 cohort JSON、1/12/200 个原件全部保留、supporting 可读、
重放不新增计划、generation 改变生成 revision 2、授权前 execution 数为 0、旧计划不能授权、当前
approved 计划可由 fake Module 5 claim，且实际 provider 调用数始终为 0。

## 9. 验证证据

2026-07-17 在当前提交候选上实际执行：

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| Module 4.5 聚焦测试 | `node --test test/unit/routing-*.test.js test/integration/authoritative-routing-app.test.js` | 76 tests，76 pass，0 fail |
| 本机普通回归 | `npm test` | 503 tests，496 pass，0 fail，7 Emulator-only skip |
| Linux Node 22 普通回归 | 临时测试镜像基于 `node:22-slim` 执行 `npm test` | 503 tests，496 pass，0 fail，0 cancelled，7 Emulator-only skip |
| Firebase 统一回归 | `npm run test:emulator` | 68 tests，68 pass，0 fail；Auth、Firestore、Storage Emulator 正常清理 |
| 生产依赖审计 | `npm audit --omit=dev` | 0 vulnerabilities |
| 生产镜像 | `docker build -f services/backend/Dockerfile -t elsewhere-backend:routing-v1 .` | 构建成功 |
| 补丁格式 | `git diff --check` | 通过 |

Linux 回归最初发现一条 Module 4 软超时测试只依赖生产 `unref()` timer，导致精简容器提前结束；修复
仅给对应测试夹具增加有界 keep-alive，未改变生产超时逻辑。统一 Emulator 首轮还暴露出 routing
并发测试屏障只代理 `transaction.get()`、而真实仓储使用 `getAll()`；测试 composition 改为显式
arm 并在真实调用前同步后，聚焦并发契约 2/2 和统一回归 68/68 均通过。生产仓储代码未为测试
特例改写。

完整 `npm audit` 另报告 3 个 moderate 开发工具链漏洞，路径均为
`firebase-tools@15.22.2 → @google-cloud/pubsub → @opentelemetry/core`。它们不进入
`npm ci --omit=dev` 生产镜像；当前建议的自动修复需要 `--force` 并降级到 breaking 版本，因此本模块
不做破坏性依赖变更，后续单独跟踪 Firebase CLI 上游修复。

## 10. 已知边界与下一模块

- 当前 Router 的内容分类只使用 Fragment type 与 Module 4 技术事实，不增加默认 AI classifier；
- Places、OCR、Embedding、Gemini 的 provider、结果 schema 与生产配额执行属于 Module 5；
- malware scanning、完整语义解析、地图 grounding、转码和 Agent 不在本模块；
- `billing_uncertain` 不自动恢复调用；
- 本地 Emulator 不证明 Cloud Run IAM、Eventarc invoker 或生产 service account 已正确部署。

Module 4.5 完成后停止，不自行实现 Module 5。
