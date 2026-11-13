# 开源项目的可运行示例

[任务状态与检查点分析](../../docs/06-architecture/06.md) · [记忆存储实现](../../docs/07-engineering/03.md)

## LangGraph Store 与检查点

这里直接调用官方 @langchain/langgraph 1.7.4 和锁定的检查点依赖 1.2.2，不使用教材的模拟 Store。示例不需要模型、embedding、凭据或网络调用。

~~~sh
npm ci
npm run example:langgraph
npm run test:projects
~~~

[代码](langgraph-store.mjs)创建官方 StateGraph、MemorySaver、InMemoryStore，先后运行两个属于 u1 的会话及一个 u2 会话。节点直接读 Store，不生成 LLM 答案。

可以观察：同一用户的跨会话偏好共享、thread_id 对应的 visits 分别保留、同键覆盖不新增版本，以及宽 namespace 前缀能访问多个用户记录。后者说明原始 Store API 不自动替应用完成认证。

[实际运行记录](langgraph-recorded.json)只记录稳定字段，不把随机 ID 或时间当断言。[两个回归测试](langgraph-store.test.mjs)验证上述分工。调用顺序、结果表和检查点源码直接在[任务状态持久化与恢复](../../docs/06-architecture/06.md)中分析。

两个组件都用内存后端；新实例不共享旧数据，没有数据库持久化、自动提取或语义搜索效果验证。Mem0、Letta 与 LlamaIndex 目前提供固定版本源码分析，未在本仓库运行其完整系统。
