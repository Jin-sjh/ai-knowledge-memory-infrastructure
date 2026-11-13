# 第三章实验：Atlas 信息形成流水线

[返回第三章](../../docs/03-formation/README.md)

## 你能验证什么

一批合成来源经过采集、预处理、候选提取、验证、筛选和写入，生成可观察的中间 JSON。实验展示权限、证据、意图范围、幂等和版本检查，不是完整知识库或 Agent 服务。

**默认模式没有调用模型。** candidates 与 reviews 是教材编写者预设的场景输入和判定，不是真实模型输出或专家审核。它们让读者能稳定复现正确与错误路径。哈希只绑定快照，不赋予审核权。

## 快速运行

在仓库根目录使用 Node.js 22：

~~~sh
npm ci
npm run lab:formation
npm run test:formation
~~~

默认输出到被 Git 忽略的 .lab-runs/formation。每次从空内存状态开始；上一次输出不是下一次的数据库。

| 阶段 | 命令中的 stage | 输出 |
| --- | --- | --- |
| 采集 | acquire | 01-acquire.json：来源、重复与拒绝 |
| 预处理 | preprocess | 02-preprocess.json：结构块和规范化偏移 |
| 提取候选 | extract | 03-extract.json：模式及候选 |
| 核验证据 | verify | 04-verify.json：结构、定位和判定状态 |
| 筛选 | select | 05-select.json：保存决策和原因 |
| 写入模拟 | write | 06-write.json：结果、版本、回执和 outbox |

~~~sh
npm run lab:formation -- --stage preprocess
npm run lab:formation -- --stage verify --out .lab-runs/verify
npm run lab:formation -- --stage all --input labs/formation/fixtures/atlas.json
~~~

指定阶段会从原始输入执行到该阶段，不执行后续阶段。extract 在离线模式只是加载预设候选，不是运行抽取算法。summary.json 是本次输出摘要；重用旧目录可能保留此前更后阶段的文件，判断当前执行范围应看 summary.stages。需要完全独立结果时指定新 out 目录。

## 阅读实验材料

- [输入、候选、判定与命令](fixtures/atlas.json)。
- [独立编写的预期决策](fixtures/expected.json)。
- [实际离线运行记录](fixtures/recorded-run.json)。
- [候选 Schema](candidate.schema.json)。
- [流水线源码](lib/pipeline.mjs)、[模型适配器](lib/model-adapter.mjs)、[测试](test/pipeline.test.mjs)。

15 个采集事件产生 12 个允许的来源，1 个重复，2 个拒绝；16 个候选走不同决策；18 条写入命令最终产生 3 个逻辑对象、4 个内容版本及 5 个待办事件。最后一条命令重放第一条成功回执，没有再次新增版本。数字仅描述这批合成输入，不是通用准确率或性能指标。

## 可信控制面与不可信候选

可信部分是实验上下文、连接器 scope/actor/retention 元数据、独立 reviews 和写入 commands。它们模拟真实系统的认证、授权与审核边界。

不可信候选只允许 id、source_key、chunk_id、quote、type、subject、predicate、value、conditions、content。不能增加 scope 或 approved。真实服务必须保护可信部分，不能让客户端上传整个实验输入后直接当生产授权使用。

review 条目绑定 candidate_hash 和 source_hash。候选或来源变化后旧判定失效；**不要把自动重算哈希当重新审核**。先检查完整原文及范围，再为确实审阅过的快照记录批准或拒绝。教材 reviews 是场景答案，不是密码学签名。

## 建议亲手做的五个扰动

1. 将正常候选人数改成 999，不改 reviews：应 NEEDS_REVIEW。
2. 不改引用行，只给规范增加适用限制：来源哈希变化，应重新审核。
3. 移除 writable_scopes：即使策略接受，写入也拒绝。
4. 同 event_id 换 operation：应 IDEMPOTENCY_CONFLICT；新 event_id 配旧 expected_version 则为 VERSION_CONFLICT。
5. 检查删除请求之后的 store：偏好仍在，因为这里只向治理模块交接，没有完成删除。

完整表格块超过 maxChars 时只告警，不强切。偏移以规范化文本的 UTF-16 代码单元计量，不是字节、Token 或 PDF 坐标。

## 可选真实模型入口

适配器使用可配置的 Chat Completions 兼容 HTTPS 接口，默认 base 为 https://api.openai.com/v1，不默认选模型。先在本机安全设置 FORMATION_API_KEY，再配置模型。不要把凭据写入仓库、截图或日志。

PowerShell 示例：

~~~powershell
$env:FORMATION_MODEL = "你的接口支持的模型名称"
$env:FORMATION_BASE_URL = "https://你的服务域名/v1"
npm run lab:formation -- --mode live --stage extract --out .lab-runs/live
~~~

如果使用默认 OpenAI 接口，可不设置 BASE_URL。仅在确认接口和模型支持时设置：

~~~powershell
$env:FORMATION_JSON_MODE = "1"
$env:FORMATION_TOKEN_PARAMETER = "max_completion_tokens"
~~~

兼容服务若使用 max_tokens，可将 TOKEN_PARAMETER 改为 max_tokens。适配器最多请求 2500 个输出 Token，30 秒超时，不自动重试；输入消息超过 20000 字符会拒绝，应先拆分教材批次。字符阈值是粗边界，不是准确 Token 预算。调用可能产生费用，按实际服务计费；本项目没有提供模型质量或费用成绩。

只发送已获读取权限且 retention_allowed 的来源。数据里的注入文本仍是不可信材料，不改变任务。保留策略与对外传输授权在生产中需要单独设计，本实验只使用合成数据。

## 如何检查真实输出，而不是自动批准

真实模式默认不加载教材 reviews。即便返回合法 JSON，候选仍需同样的结构、引用和语义核验。模型若输出 reviews，外层结构会被拒绝。

先保存 extract 结果，再离线导入：

~~~sh
npm run lab:formation -- --candidates .lab-runs/live/03-extract.json --stage verify --out .lab-runs/live-verify
~~~

输出模式标记为 imported-candidates，默认判定列表为空。阅读 04-verify.json 的 candidate_hash、source.source_hash 和完整来源后，可另行编写判定数组并显式传入：

~~~sh
npm run lab:formation -- --candidates .lab-runs/live/03-extract.json --reviews your-reviewed-decisions.json --stage select --out .lab-runs/live-reviewed
~~~

判定条目字段是 candidate_id、candidate_hash、source_hash、status、reason、reviewer；status 可用 approved、rejected、needs_review。新模型候选的 ID 不一定等于教材 ID；如果以后执行写入，还需在实验输入中明确编写对应 commands。不会从模型建议自动生成执行命令。

不要用模型自己的 approved=true 代替独立判定。审核者也可能出错，真实评测需双人标注、分歧复核和错误反馈。

## 实现边界与实际验证范围

内存 store 用克隆后替换模拟事务，未连接数据库、队列或向量库。outbox 只是待办数组，没有消费者。DELETE_REQUESTED 不设置删除屏障、不清理副本，当前数据仍存在。没有多进程并发测试、持久化恢复或端到端模型效果实验。

模型适配器只运行模拟响应测试：验证请求形状、超时/错误处理、拒答、截断、非法 JSON 和不允许的审核字段，**没有真实供应商调用验证**。

诊断快照保留原始合成文本，包括“不长期保存”的案例。它们不能被用作真实用户数据的隐私处理实现。更完整的生命周期、删除传播与任务恢复参见第四章和第六章。

接口格式与 JSON mode 的区别见 [R13 官方资料](../../docs/references/README.md#r13)。实验只采用这部分接口契约，不声称兼容所有供应商或复现研究论文。
