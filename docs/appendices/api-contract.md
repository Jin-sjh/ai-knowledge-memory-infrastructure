# API 参考契约与模块协作

> 设计文档，无在线端点。以下 JSON 为示例，不构成 SDK。

## 可信调用上下文

认证层注入 tenant_id、principal_id、角色和授权范围；请求体只表达希望访问的范围，不能声明权限。服务把请求范围与实际授权求交，所有读取回查主记录及删除屏障。未知或不可见对象统一返回不泄露存在性的错误。

## 最小接口

| 操作 | 输入 | 输出与语义 |
| --- | --- | --- |
| POST /v1/items | 候选、证据、Idempotency-Key | 201 主记录版本，索引任务单列 |
| POST /v1/items/{id}/revisions | expected_version、修订及证据 | 201 后继版本；不符返回 409 |
| POST /v1/search | query、类型、范围、as_of、limit | 候选、检索器及排名分，不承诺已验证 |
| POST /v1/retrieve | query、用途、时点 | 授权有效的证据与冲突 |
| POST /v1/memories | 主体、用途、内容与来源 | 策略结果及对象版本，可能进入审核 |
| POST /v1/context | 任务、范围、时点、预算 | 上下文清单、missing、conflicts、truncated |
| DELETE /v1/items/{id} | expected_version、Idempotency-Key | 202 删除任务，在线屏障先于受理响应生效 |
| GET /v1/jobs/{id} | 任务 ID | 状态、各存储确认与重试原因 |
| PUT /v1/runs/{id}/checkpoint | expected_version、游标和副作用 | 新检查点版本；不从记忆摘要恢复 |

所有写入检查真实主体权限。删除、记忆写入和 checkpoint 是独立能力，拥有读取权限不意味着拥有执行权限。真实业务动作由应用额外授权。

## Context 示例

请求体：

```json
{
  "query": "只有一人审批，可以普通发布吗？",
  "as_of": "2026-11-03T00:00:00Z",
  "requested_scope": {
    "kind": "project",
    "id": "atlas"
  },
  "token_budget": 2000
}
```

响应体（未调用审批工具时只解释规则）：

```json
{
  "schema_version": "1",
  "trace_id": "demo-trace",
  "items": [
    {
      "id": "rule",
      "version": 2,
      "evidence_ids": [
        "ev-rule-v2"
      ],
      "content": "普通发布需两名审批者。"
    }
  ],
  "missing": [
    "实时审批状态需业务工具核验"
  ],
  "conflicts": [],
  "truncated": false
}
```

预算按目标模型 tokenizer 计量，输入预算扣除系统指令与预留输出。超限按完整证据单元裁剪并返回 truncated；无法容纳关键规则时记录 missing，不截断否定、数值或例外。示例内容清单由调用方安全组装，不能把资料内容升级为控制指令。

## 幂等、并发与事件

幂等范围为租户、操作和 Idempotency-Key，服务保存请求哈希与结果；相同键不同内容返回 409。幂等保留窗口由部署明确。版本不匹配返回 409 VERSION_CONFLICT，不自动覆盖。主记录与 outbox 同事务提交；事件携带 event_id、object_id、object_version、schema_version、occurred_at 和 trace_id。消费者去重并校验目标版本，失败指数退避，超过上限进入死信待审核。

删除任务状态为 accepted、running、partial_failure、completed。在线访问屏障不等待索引清理；completed 需所有约定存储确认。备份清理期限与恢复重放单列报告，不用一个 completed 掩盖尚有保留副本。

## 错误与兼容

400 INVALID_INPUT 表示结构或约束不合法；404 NOT_FOUND_OR_NOT_VISIBLE 避免对象枚举；409 VERSION_CONFLICT/IDEMPOTENCY_CONFLICT；422 INSUFFICIENT_EVIDENCE 表示不能形成请求的确定结果；429 RATE_LIMITED；503 DEPENDENCY_UNAVAILABLE。Context 可以成功返回部分证据，但必须列 missing，不将依赖失败伪装成完整结果。

响应均带 schema_version 和 trace_id，错误带 code 与可供用户理解的 message；不返回内部堆栈或隐藏对象信息。新增可选字段向后兼容，删除字段和含义改变通过新主版本；记录迁移与回滚计划。
