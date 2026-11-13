# LangGraph：Store 与检查点实际怎样分工

[实现案例目录](README.md) · [真实运行示例](../../examples/projects/README.md)

## 案例使用的真实组件

本例直接导入官方 @langchain/langgraph 1.7.4，锁定依赖 @langchain/langgraph-checkpoint 1.2.2。使用 InMemoryStore、MemorySaver 和 StateGraph，未替换为本书模拟实现，也不需要模型、embedding 或 API Key。

Store 对 namespace/key 保存应用信息；MemorySaver 对 thread_id 等标识保存图状态。二者都在内存里，“可跨会话访问”不等于“进程退出后仍持久化”。

## 最小数据与调用

示例先用官方 Store 写入偏好，再由一个图节点读取。下面是本书编写的示例代码节选：

~~~js
const store = new InMemoryStore();
await store.put(
  ["users", "u1", "preferences"],
  "answer_style",
  { style: "详细解释" }
);
~~~

之后同一 namespace/key 写入“先给简短结论”。在所核验的 Node.js 实现中，同键写入直接替换 value 并更新时间，并不自动建立本书实验那样的内容版本链。[Store 实现](https://github.com/langchain-ai/langgraphjs/blob/959f041dfb8f6bbafa6af3ebb4bc20484a9290da/libs/checkpoint/src/store/memory.ts#L188-L219)

何时认为用户形成新偏好、何时调用 put，由应用决定。Store 不会仅因收到自然语言消息而自行提取或更正记忆。

## 实际运行观察

运行：

~~~sh
npm ci
npm run example:langgraph
npm run test:projects
~~~

[完整代码](../../examples/projects/langgraph-store.mjs)由确定性节点读取偏好，并用 reducer 累加 visits。观测结果如下，原始 JSON 见[运行记录](../../examples/projects/langgraph-recorded.json)。

| 调用顺序 | 会话 | 用户 | 节点读到的偏好 | 本会话 visits |
| --- | --- | --- | --- | --- |
| 1 | conversation-a | u1 | 详细解释 | 1 |
| 2：更新 Store 后 | conversation-b | u1 | 先给简短结论 | 1 |
| 3：继续原会话 | conversation-a | u1 | 先给简短结论 | 2 |
| 4 | conversation-c | u2 | 未设置 | 1 |

第二次调用表明，新会话可读共享 Store 中 u1 的当前偏好。第三次表明，原会话恢复自己的 visits，但读取的偏好仍来自当前 Store。**会话状态不是用户记忆的另一份自动同步副本。**

节点没有生成自然语言答案；表中的结果是代码读取的值，不是 LLM 遵循偏好的效果成绩。

## 检查点到底按什么保存

MemorySaver.put 读取 thread_id、checkpoint_ns 和 checkpoint.id，将序列化检查点及父关系保存在对应会话下；缺 thread_id 会报错。[检查点写入](https://github.com/langchain-ai/langgraphjs/blob/959f041dfb8f6bbafa6af3ebb4bc20484a9290da/libs/checkpoint/src/memory.ts#L462-L509)

因此不同 thread 可有独立执行状态，却共享同一个应用 Store。当前示例用真实 graph.getState 回查，conversation-a 的 visits 为 2，conversation-b 为 1，两个状态没有混在一起。

保存图状态不保证任意外部动作都不会重复执行。调用外部工具仍需幂等、确认与恢复设计，不能把检查点能力推广为所有副作用的 exactly-once。

## namespace 为什么不等于认证

示例最初按 u2 的 namespace 读取，得到未设置；随后给 u2 独立写入一条偏好，再直接调用原始 Store 的 search(["users"])，会同时得到 u1 和 u2 的记录。

这不是越权漏洞证明，而是说明原始 Store 是数据原语：更宽的合法查询前缀允许返回更多记录。应用必须根据认证主体限制可用 namespace，不能把 user_id 原样交给客户端自由决定。

本例的两个测试分别检查会话/Store 分工和宽前缀行为，没有宣称实现生产认证系统。

## 持久化和语义检索的边界

同一键更新后，u1 的记录数仍是 1，说明这是覆盖，不是自动版本管理。新建一个 InMemoryStore 后读不到旧数据，说明这些实例不共享持久化后端；进程级持久化需要数据库存储实现。

本例未配置 embedding，因此不验证语义检索。它回答的是更基础的问题：偏好放哪里、会话状态放哪里，以及二者怎样在实际框架中组合。

Python LangGraph 与 Node.js LangGraph 使用相关概念，但本节源码链接、依赖锁与运行记录均针对 Node.js 发布版本，不把跨语言实现当作逐行一致。
