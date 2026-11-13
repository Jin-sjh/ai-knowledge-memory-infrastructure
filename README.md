# AI 知识与记忆基础设施

**AI Knowledge & Memory Infrastructure**

从理论、信息形成和生命周期，到检索、上下文、系统架构与效果验证的中文技术专著。

**[在线阅读](https://jin-sjh.github.io/ai-knowledge-memory-infrastructure/)** · 中文搜索 · 八章导航 · 深浅色切换

## 阅读路线

适合已有 LLM 基础、希望理解外部知识与 Agent 记忆系统的开发者。首次阅读按 01—08 顺序；关注工程可先读 01、02、06、07，再回到机制与评测。

| 章节 | 主要问题 |
| --- | --- |
| [01 基础概念、理论模型与研究边界](docs/01-foundations/README.md) | 模型已经知道很多，为什么还需要外部系统？ |
| [02 信息分类体系与知识表示模型](docs/02-representation/README.md) | 信息应按什么维度分类？ |
| [03 知识与记忆的形成机制](docs/03-formation/README.md) | 采集如何保留出处和权限？ |
| [04 知识与记忆的生命周期及演进机制](docs/04-lifecycle/README.md) | 信息可以相信到什么程度？ |
| [05 信息检索、记忆召回与上下文工程](docs/05-retrieval-context/README.md) | 不同查询应该走哪条访问路径？ |
| [06 统一知识与记忆基础设施架构设计](docs/06-architecture/README.md) | 逻辑架构需要从一开始拆微服务吗？ |
| [07 技术选型、核心实现原理与架构演进](docs/07-engineering/README.md) | 各种存储各自适合什么？ |
| [08 评测方法、实验设计与典型应用](docs/08-evaluation/README.md) | 知识质量如何被测量？ |

## 主线

知识与记忆共享来源、证据、时间、权限和版本底座，分别采用合适的形成、更新与召回策略。状态支持精确恢复，上下文是本次调用实际看到的信息。RAG、Wiki、Graph 与 Memory 可以组合。

## 首版内容

- 八章正文：48 个独立主题，271 个细分考点。
- 第三章配有 [Atlas 案例与 Node.js 实验](labs/formation/README.md)，可查看中间数据、运行失败场景，并选择接入真实模型。
- [项目实现案例](docs/implementations/README.md)：LlamaIndex、Mem0、Letta Code 和 LangGraph 的源码路径、数据变化与设计取舍；LangGraph 提供官方包运行示例。
- [术语表](docs/appendices/glossary.md)、[贯穿案例](docs/appendices/atlas-case.md)、[选型矩阵](docs/appendices/technology-matrix.md)。
- [数据模型](examples/README.md)、[API 参考契约](docs/appendices/api-contract.md)、[实验规程](docs/appendices/evaluation-protocol.md)。
- [一手文献](docs/references/README.md)、[原始大纲](sources/outline-v2.md)、[覆盖映射](sources/coverage.md)。

**实验说明：** 配套代码在本地运行，用于演示信息处理流程，不提供在线服务或 SDK。Atlas 为合成案例，离线测试不用于证明模型质量或架构收益。技术资料核验日期：2026-11-13。

## 本地检查

需要 Node.js 22 或更高版本。

```sh
npm ci
npm run check
node scripts/score.mjs examples/evaluation/gold.json examples/evaluation/sample-predictions.json
```

检查覆盖内链与锚点、章节映射、Mermaid 语法、JSON 和 Schema，不能替代事实审稿、图形视觉审稿和真实系统实验。

## 网页构建与发布

运行 npm run site:build 生成静态文档站，npm run site:preview 本地预览。网站由现有 Markdown 构建，自动转换章节链接并渲染 Mermaid；无需维护第二份正文。main 分支更新后，Pages 工作流先检查、再构建并发布到上述网址。

## 参与维护

见[贡献指南](CONTRIBUTING.md)、[写作规范](docs/appendices/writing-guide.md)、[路线图](ROADMAP.md)和[更新记录](CHANGELOG.md)。

## 授权

原创正文图表采用 [CC BY 4.0](LICENSE-CONTENT.md)，代码、Schema 与合成数据采用 [MIT](LICENSE-CODE)。第三方材料权利归原作者。
