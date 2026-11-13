# Letta Code：记忆文件如何进入模型上下文

[实现案例目录](README.md) · [第三章记忆提取](../03-formation/04.md)

## 先确认分析的是哪个 Letta

Letta 原仓库当前 [README](https://github.com/letta-ai/letta/blob/8816d3a8516893bfdc0fa14bfb1235226012e295/README.md)将现行源码指向 letta-ai/letta-code，并把旧 V1 API 服务放到历史分支。

本节分析 letta-code 提交 bd31b0a72dfad1ba14fc3a82f47da6a2b606330d 的本地 MemFS v2。不能将旧版 core_memory_append 或 memory block API 的教程直接当作当前全部实现。

## 具体数据结构：文件层级而非统一记忆向量列表

下面目录是本书编写的示例，说明该布局下哪些内容会常驻、哪些按需展开：

~~~text
memory/
├── MEMORY.md
├── human.md
└── projects/
    ├── MEMORY.md
    └── atlas.md
~~~

根 MEMORY.md 是入口索引，human.md 可保留简短的用户偏好；projects/MEMORY.md 索引项目知识，atlas.md 放详细规范。

实现通过根 MEMORY.md 识别 v2。根级 Markdown 被视为核心记忆；深层文件只有在路径经过的目录都具备 MEMORY.md 索引时，才属于可投影的记忆路径。[层级判定](https://github.com/letta-ai/letta-code/blob/bd31b0a72dfad1ba14fc3a82f47da6a2b606330d/src/agent/memory-format.ts#L1-L41)

这不是“所有 Markdown 都放进提示”。目录结构承担了访问和组织策略，skills 也有独立入口。

## 用户改变偏好后，系统怎样看见它

假设 human.md 已保存“项目问题先详细解释”，用户现在要求“先给简短结论”。按该架构，需要发生的是：

~~~text
对话表达变化
  → Agent 判断值得记住
  → 编辑相应记忆文件
  → 提交 MemFS 的 Git 变更
  → 后续编译读取已提交快照
  → 核心记忆投影进入系统提示
~~~

这个图解释的是源码和提示支持的路径，**不是本书已经执行的自动反思轨迹**。选择保存什么、怎样归纳由 Agent 行为承担；仅查看文件读取工具，不能证明偏好判断本身已由确定性算法完成。

系统提示模板要求将持久偏好与可复用教训写入合适层级，并区分常驻核心与外部细节。[该版本的记忆说明](https://github.com/letta-ai/letta-code/blob/bd31b0a72dfad1ba14fc3a82f47da6a2b606330d/src/agent/prompts/letta_root_memfs.md#L26-L58)

## 一个容易忽略的边界：编辑不等于提示立即变化

提示编译器先取得 Git HEAD，列出该提交里的 Markdown，再从 HEAD 对应路径读取文件内容，而不是直接把所有工作区修改都编入提示。[快照读取](https://github.com/letta-ai/letta-code/blob/bd31b0a72dfad1ba14fc3a82f47da6a2b606330d/src/backend/local/system-prompt-compilation.ts#L65-L142)

v2 投影将根级核心文件的内容写入核心记忆区，同时提供子目录入口；再把结果插入原系统提示中的核心记忆位置。[根级投影](https://github.com/letta-ai/letta-code/blob/bd31b0a72dfad1ba14fc3a82f47da6a2b606330d/src/backend/local/system-prompt-compilation.ts#L154-L198) · [提示注入](https://github.com/letta-ai/letta-code/blob/bd31b0a72dfad1ba14fc3a82f47da6a2b606330d/src/backend/local/system-prompt-compilation.ts#L432-L460)

因此，“磁盘文件已编辑”“变更已提交”“新提示已编译”“模型已在某次调用看到它”是四个不同状态。提示模板也明确区分当前轮与后续重编译。本节不分析所有重编译触发器，不能据此声称任意编辑都会在下一 token 自动生效。

## 深层记忆怎样逐步展开

Memory 工具先检查当前 Agent 是否有 MemFS v2 目录，再解析相对于记忆根的路径：

- 拒绝绝对路径、上级目录、隐藏路径与保留的 skills 入口。
- 对真实路径做根目录范围检查。
- 目录请求返回该目录索引及直接子文件、子目录信息。
- 文件请求返回内容；过大、非文本或已在核心上下文中的根文件有专门处理。

这些逻辑见 [Memory 工具入口](https://github.com/letta-ai/letta-code/blob/bd31b0a72dfad1ba14fc3a82f47da6a2b606330d/src/tools/impl/memory.ts#L348-L426)，目录输出与预算处理见 [renderDirectory](https://github.com/letta-ai/letta-code/blob/bd31b0a72dfad1ba14fc3a82f47da6a2b606330d/src/tools/impl/memory.ts#L244-L325)。

例如读取 projects 时，工具展示项目索引和 atlas.md 的入口；读取 projects/atlas.md 才展开其详细内容。这里是按目录逐步发现，不必每次对全部记忆做向量 TopK。

还要注意：Memory 工具从工作区文件读取，核心提示编译读取已提交快照。两条读取路径服务不同目的，不能简单认为它们每一刻都代表同一版本。

## 对本章形成机制的启发

文件写入本身很容易，难点在信息放在哪一层、何时提交、怎样进入未来上下文。核心文件放稳定行为约束和简短索引，深层文件放详细资料，可以减少每轮上下文负担，但索引失效、错误归纳和陈旧内容仍需维护。

Git 版本能解释文本变化，不自动证明内容真实，也不自动实现个人信息授权、删除传播或跨 Agent 隔离。路径约束只解决这里的文件访问边界，不是完整安全证明。

本节只核验相关源码及提示，未运行 Letta Agent 或自动反思。原始提示中的身份描述与行为要求仅作为被分析材料，不是本书或读者应执行的指令。
