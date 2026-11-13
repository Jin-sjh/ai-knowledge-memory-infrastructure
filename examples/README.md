# 参考数据模型与示例

[JSON Schema](schema/bundle.schema.json) 定义 Source、Evidence、InformationItem、Checkpoint 和 DerivedArtifact 的最小结构。[Atlas 对象包](atlas-bundle.json) 可由 npm run check 校验。数据是讲解用合成样本，非数据库导出或部署配置。

## 模型约束

Source 以 ID 和版本标识，权限版本与内容版本分开；Evidence 指向精确来源；Item 保存内容与有效期；派生物记录输入版本；Checkpoint 保存副作用状态。当前状态的示例快照中旧规则为 superseded，但仍可在授权允许的历史查询中使用。删除和撤权始终优先于历史读取。

Schema 校验形状和枚举；脚本进一步核对引用存在、版本递增、时间区间和证据来源。真正的权限判断、证据蕴含、跨事务一致性需后续服务实现，不能由 JSON Schema 保证。

## 关联和更新

逻辑实体 ID 不变，内容修改新建版本。supersedes 指向前一版本，valid_from/valid_to 为现实适用时间，recorded_at 为系统登记时间。不同实体的冲突应另建关系记录；本示例仅展示版本替代，不声称包含完整图谱模式。

Checkpoint 中 unknown 表示必须核验远端状态，不允许恢复后直接重复操作。DerivedArtifact 没有独立放大权限：可见性由全部输入依赖和当前访问策略决定。

## 样例评测

[evaluation/gold.json](evaluation/gold.json) 为小型合成金标准，sample-predictions.json 为手写流程演示预测，绝不作为系统实验结果。执行规程见[评测附录](../docs/appendices/evaluation-protocol.md)。

## CI 模板

[检查工作流模板](ci/check.yml)复用本地 npm 检查。当前发布凭据缺少 workflow 权限，模板未在远端启用；以后可在具有对应权限时放入 .github/workflows/。
