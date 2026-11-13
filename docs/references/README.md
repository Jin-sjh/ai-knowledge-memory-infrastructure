# 参考文献与核验边界

核验日期：2026-11-13。使用论文原始页面、标准与官方资料。论文核验限于摘要和书目信息，不声称完整复现；工程推导与方案由本书提出。未复制第三方长段落或图表。

## R01

[Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401)

Lewis et al., 2020。核验摘要；参数与非参数信息结合的研究背景，不作为本项目收益。

## R02

[MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560)

Packer et al., 2023。核验摘要；层次化上下文管理，不声称已复现。

## R03

[Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442)

Park et al., 2023。核验摘要；记忆与反思的研究入口，不是通用认知理论。

## R04

[From Local to Global: A Graph RAG Approach to Query-Focused Summarization](https://arxiv.org/abs/2404.16130)

Edge et al., 2024。核验摘要；区分局部检索与全局主题综合，不外推全部图检索。

## R05

[Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172)

Liu et al., 2023。核验摘要；其研究中的位置敏感性需在目标模型重验。

## R06

[LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory](https://arxiv.org/abs/2410.10813)

Wu et al., 2024。核验摘要；长期交互记忆评测，不替代删除权限测试。

## R07

[PROV-DM: The PROV Data Model](https://www.w3.org/TR/prov-dm/)

W3C, 2013。核验规范页面；来源派生建模参考，本项目非完整实现。

## R08

[PostgreSQL 18: Row Security Policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)

核验官方文档；实施时检查角色与绕过权限。

## R09

[pgvector 官方仓库](https://github.com/pgvector/pgvector)

核验 README；精确和近似检索能力，未运行性能实验，实施需锁提交。

## R10

[PostgreSQL 18: Full Text Search](https://www.postgresql.org/docs/18/textsearch-intro.html)

核验官方文档；不保证默认分词适合全部中文数据。

## R11

[PostgreSQL 18: Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html)

核验官方文档；outbox 是本项目建议，不是该页完整教程。

## R12

[JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)

核验规范索引；结构验证不承担事实验证。

## R13

[OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) 与 [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat)。2026-11-13 核验官方请求形式和 JSON mode 边界；用于第三章可选适配器的接口说明，不作为语义正确、模型效果或所有兼容服务可用性的证据。本轮只做模拟接口测试，没有实际模型调用。

正文 [Rxx] 对应本页条目，篇末提供直达链接。延伸阅读不代表每条工程建议都来自论文。可变页面在实施前重新核验并锁定版本。
