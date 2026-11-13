# LlamaIndex：文档怎样变成可索引的节点

[实现案例目录](README.md) · [第三章预处理](../03-formation/02.md)

## 分析范围

本节阅读 run-llama/llama_index 提交 baeabbfe26241a6916e13e2a8c8156a02e0602cd 的 Python IngestionPipeline 和 NodeParser。核验日期为 2026-11-13，未实际运行完整模型或向量存储流程。

这里研究的是文档摄取机制，不能把“生成 Node”直接解释成“提取出经过验证的事实”。

## 真实调用链：先收集输入，再按配置转换

IngestionPipeline.run 先收集传入 documents、nodes、构造时配置的 documents，以及 readers.read() 返回的内容。之后选择文档重复处理策略，运行 transformations，再把带 embedding 的节点交给 vector_store，最后更新 docstore。[输入汇集](https://github.com/run-llama/llama_index/blob/baeabbfe26241a6916e13e2a8c8156a02e0602cd/llama-index-core/llama_index/core/ingestion/pipeline.py#L429-L449) · [运行流程](https://github.com/run-llama/llama_index/blob/baeabbfe26241a6916e13e2a8c8156a02e0602cd/llama-index-core/llama_index/core/ingestion/pipeline.py#L572-L662)

按源码概括：

~~~text
Document / Node / reader 输出
  → 文档 ID 与 hash 检查
  → SentenceSplitter 等转换
  → 可选提取器、embedding 等后续转换
  → 有向量的节点进入 vector_store
  → 更新文档存储与 hash
~~~

转换顺序由调用方配置。默认转换包含 SentenceSplitter 和配置的 embedding 模型；不能因只是运行 ingestion，就假设一定不产生外部模型调用。[默认转换](https://github.com/run-llama/llama_index/blob/baeabbfe26241a6916e13e2a8c8156a02e0602cd/llama-index-core/llama_index/core/ingestion/pipeline.py#L423-L427)

## 具体案例：发布规范的来源如何跟随切块

假设应用传入文档 ID 为 atlas-policy、正文含普通与紧急发布规则，并附项目、文件名等 metadata。解析后若产生多个 TextNode，每个节点除了文本，还可以携带来源关系、继承的 metadata、字符位置及前后节点关系。

NodeParser 的后处理会尝试在父文档中查找节点原文，能定位时设置 start_char_idx 和 end_char_idx；它为重复和重叠片段保留搜索位置，避免总匹配到第一次出现。同源相邻节点还可建立 PREVIOUS/NEXT 关系。[节点后处理](https://github.com/run-llama/llama_index/blob/baeabbfe26241a6916e13e2a8c8156a02e0602cd/llama-index-core/llama_index/core/node_parser/interface.py#L84-L155)

这使检索块能回到原文并补邻近上下文。但位置是条件性获得的：只有找到文本且节点类型适合时才赋值，不能声称任何自定义转换后都能无损定位。具体 splitter 是否保持表格结构也需另行验证，本段接口本身没有保证。

metadata 合并时节点已有值优先。应用若把 ACL 字段放进 metadata，还需防止不可信转换覆盖它；元数据继承不是完整授权实现。

## 文档去重与转换缓存是两层机制

文档去重比较来源的 ID/hash，决定哪些输入还需进入处理。转换缓存则给“本阶段输入内容与该转换配置”计算 key，命中时直接复用该阶段产生的节点。[转换 hash](https://github.com/run-llama/llama_index/blob/baeabbfe26241a6916e13e2a8c8156a02e0602cd/llama-index-core/llama_index/core/ingestion/pipeline.py#L58-L69) · [缓存执行](https://github.com/run-llama/llama_index/blob/baeabbfe26241a6916e13e2a8c8156a02e0602cd/llama-index-core/llama_index/core/ingestion/pipeline.py#L72-L113)

例如相同文档和相同 splitter 配置再次处理，可以复用转换结果；调整 splitter 配置会改变转换 key。缓存不是事实验证，也不必等于“单个 Chunk 永远独立缓存”：所读函数的 key 由本次传入节点序列与转换共同组成。

这两个层次不应混淆。文档没变可不重做全部流程，某阶段输入与配置没变可不重算该转换，分别解决不同重复成本。

## 更新一份同 ID 文档会发生什么

在同时配置 docstore、vector_store 并选择 UPSERTS 时，代码按 ref_doc_id（缺失时用自身 ID）查旧 hash：

| 情况 | 源码路径中的处理 |
| --- | --- |
| 没有旧 hash | 加入待处理集合 |
| 同 ID、同 hash | 跳过 |
| 同 ID、hash 改变 | 删除旧引用文档及对应向量，再重新处理 |

对应代码见 [_handle_upserts](https://github.com/run-llama/llama_index/blob/baeabbfe26241a6916e13e2a8c8156a02e0602cd/llama-index-core/llama_index/core/ingestion/pipeline.py#L469-L507)。如果只有 docstore 而没有 vector_store，这个提交会告警并在本次运行退回 duplicates_only；不能仅写一个 UPSERTS 参数就宣称更新链已经生效。[策略选择](https://github.com/run-llama/llama_index/blob/baeabbfe26241a6916e13e2a8c8156a02e0602cd/llama-index-core/llama_index/core/ingestion/pipeline.py#L574-L604)

先删旧向量再做后续转换，也不意味着跨存储事务或原子切换。转换失败的可用性、回滚和一致性需要在实际部署中设计。UPSERTS_AND_DELETE 还具有删除缺失文档的意图，不应不加分析地用于只提供部分文档的增量批次。

## 与知识提取的关系

NodeParser 主要产生结构与来源联系。若要实体、Claim 或规则，需要明确增加对应转换，并验证其输出。即使一个节点有 embedding、metadata 和来源 ID，也只说明它可以被管理和检索，不代表内容正确、条件完整或允许长期使用。

本书第三章的结构分块实验可以帮助理解这些边界，但它没有复现完整 LlamaIndex。读者应对照真实接口区分：框架提供了哪些处理钩子，应用还要补哪些领域规则、验证与权限控制。
