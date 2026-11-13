# Mem0：新消息如何成为向量记忆

[实现案例目录](README.md) · [第三章知识提取](../03-formation/03.md)

## 版本与入口

本节分析 mem0ai/mem0 的 Python OSS 同步 Memory.add 路径，提交 f1791daa86d469249c9b002f62644d58a1eb96a0。核验日期为 2026-11-13。分析范围不含云端托管服务，也不能直接外推到 TypeScript SDK 或其他历史版本。

入口接受 messages、user_id/agent_id/run_id、metadata 和 infer。至少需要一个身份作用域；自由 metadata 里的身份键会先清理，再由显式参数设置。它提供作用域组织，但调用者是否真的有权使用指定 user_id，仍需应用认证。[作用域代码](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L314-L404)

## 一次 add 实际经过哪些步骤

以下是本书对源码的重述，不是复制原函数，也不是实际运行结果：

~~~text
新消息
  → 读取该作用域最近消息
  → 为新消息生成查询向量
  → 在同作用域召回最多 10 条旧记忆
  → 新消息、近期消息、旧记忆共同构造提示
  → 一次模型调用产生 memory 列表
  → 批量生成候选记忆向量
  → 对旧召回集和本批次做文本哈希去重
  → 批量插入向量记录
  → 给实际写入的记录追加历史、实体关联
  → 保存消息，返回 ADD 结果
~~~

对应的主要阶段在 [_add_to_vector_store](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L918-L1098)；[返回阶段](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L1206-L1220)只为落库成功的记录构造 ADD 结果。

注意实际调用只把部分上下文字段传给提示构造器，不能因为函数签名支持 summary 或 recently_extracted_memories，就假设每条调用都填充了它们。[调用点](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L920-L964) · [提示构造器](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/configs/prompts.py#L1016-L1062)

## 具体示例：用户改了答复偏好

假设当前存储有“u1 喜欢详细解释项目问题”，新消息说“以后先给简短结论”。检索后的旧记忆会与新消息共同进入提取提示。这里的旧记忆用于提供上下文、去重与关系线索，不等于程序已经决定更新它。

提取器可能生成下面的结构。**这是按接口说明编写的示意，未调用模型，结果并不保证如此。**

~~~json
{
  "memory": [
    {
      "text": "u1 的项目答复偏好从详细解释改为先给简短结论"
    }
  ]
}
~~~

程序为新文本生成 embedding 和新的 UUID，附带 data、hash、created_at、updated_at 等字段，再插入向量存储。此路径没有根据这一变化自动把旧记录改成新文本。因此更准确的描述是“追加变化信息”，而不是“提取到矛盾后一定 UPDATE 原记忆”。[记录构造与插入](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L1007-L1076)

这意味着检索和上下文选择仍需要处理新旧表达。保留历史变化有利于追踪经历，但不能只凭 add 成功，就断言以后永远只召回最新偏好。

## 为什么不能照搬旧版的四分支描述

这个提交仍保留名为 DEFAULT_UPDATE_MEMORY_PROMPT 的提示和独立 update/delete 方法，add 的说明文字也保留更新、删除的描述。然而当前默认实现调用的是 ADDITIVE_EXTRACTION_PROMPT，提示构造器明确面向追加，最终结果返回 ADD。

所以必须从入口追到真正被调用的函数，而不能只搜索到含 ADD/UPDATE/DELETE/NONE 的提示就认定它仍是默认写入机制。[默认提示选择](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L942-L964) · [旧提示定义](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/configs/prompts.py#L176-L185)

同样，提示中提到 linked_memory_ids，并不能单独证明该字段会作为每条记忆间的关系落库。所读记录构造段主要消费 text 和 attributed_to；实体关联另有流程。要宣称具体关系持久化，必须继续追踪消费字段与存储实现。

## 去重和失败处理落在哪一层

文本哈希去重比较的是召回旧集合和当前批次中的精确文本，不是全库的语义一致性证明。旧记忆没被召回，或两条同义文本措辞不同，都不能仅靠该哈希去掉。[去重代码](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L1007-L1045)

模型调用异常会抛出 LLMError；提取结果解析失败在当前实现中则被处理为空候选。这两种情况不能混为“没有发现值得保存的内容”。批量嵌入与插入分别有逐条回退；历史记录写入失败会记录错误，不能把它描述成向量库与历史库的统一原子事务。[调用与解析](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L957-L991) · [持久化和历史](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L1047-L1098)

infer=false 是另一条路径：跳过系统消息，对其余合法消息直接生成向量并创建记忆，不做上述模型提取。这适合已有明确内容的写入，但绝不表示已经验证事实、保存授权或长期价值。[直接写入路径](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L881-L916)

## 从这一实现可以学到什么

1. 提取前检索旧记忆，可以减少重复并提供指代背景。
2. 模型语义去重与程序精确哈希是不同层次，覆盖范围也不同。
3. 批量嵌入和批量插入减少逐条调用，但需要表达部分失败。
4. 追加变化与覆盖当前值是不同策略，不能把某一种当所有记忆系统的必然设计。
5. 本书 Atlas 实验的独立判定、版本比较和 outbox 是教学设计，不能据此推断 Mem0 提供相同保证。

本节完成源码核验，未启动完整 Mem0，也没有生成真实模型质量、延迟或成本数据。
