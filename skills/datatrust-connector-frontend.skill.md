# DataTrust Connector Frontend Skill

## 定位

本前端不是通用数据交易平台，而是面向信安赛作品演示的 DataTrust Connector 可视化控制台。

页面必须围绕 Provider Connector 与 Consumer Connector 的可信互联过程，展示连接器注册、PKI-DID 双轨互信、DID-mTLS 可信通道、数据目录查询、数字合约生成、字段级受控交付、策略动态更新和 Fabric 审计追踪。

## 核心主线

所有页面设计必须服务于这条端到端链路：

连接器注册 → X.509 与 DID 绑定 → DID-mTLS 可信通道 → 数据目录查询 → 数字合约 → 字段级受控交付 → 策略动态更新 → Fabric 审计追踪 → 安全验证。

## 三个视角

### Provider Connector 控制台

重点展示：

- Provider Connector 身份上下文
- DID、证书指纹、公钥、角色、机构域、状态
- 数据产品发布
- 字段策略 plain / mask / encrypt / deny
- 申请与合约确认
- 交付记录与审计关联

### Consumer Connector 控制台

重点展示：

- Consumer Connector 身份上下文
- 与 Provider 的可信连接状态
- 数据目录浏览
- 数据产品申请
- 数字合约查看
- 数据调用与返回结果解释

### 可信治理与审计台

重点展示：

- DID 与 X.509 证书绑定关系
- DID Document 公钥一致性校验
- DID-mTLS 握手时间线
- Fabric 事件流
- traceId 全链路追踪
- 策略版本变更
- 安全验证与违规事件

## 必须优先实现的页面

1. 演示总览
2. 连接器身份
3. DID-mTLS 可信通道
4. 数据产品目录
5. 数字合约
6. 字段级受控交付
7. 策略动态更新
8. Fabric 审计追踪
9. 安全验证

## 视觉与交互原则

- 用企业级控制台风格，不做普通电商式数据商城。
- 强调可信、安全、可审计、可追溯。
- 页面应多使用状态卡片、时间线、策略矩阵、JSON 对比、事件流和 Trace 链路。
- 不能把 DID 仅表现为普通 ID，要体现证书 SAN DID、DID Document、公钥一致性和身份状态。
- 不能把数据调用表现成普通 API 调用，要体现合约、policyVersion、字段策略和审计事件。
- Fabric 页面必须强调链上不存敏感原文，只存哈希、摘要、事件和 traceId。
- 抗量子能力仅作为可选增强或通道安全等级展示，不作为核心页面主线。

## 推荐核心组件

- ConnectorCard
- DIDBindingPanel
- CertificateComparePanel
- HandshakeTimeline
- PolicyMatrix
- ContractJsonViewer
- JsonDiffViewer
- FabricEventStream
- TraceTimeline
- SecurityScenarioCard
- StatusTag

## 数据对象关键词

后续类型、Mock 数据和页面文案应优先围绕这些对象命名：

- ConnectorIdentity
- DIDDocument
- DataProduct
- DataField
- DigitalContract
- FieldPolicy
- PolicyVersion
- AccessTrace
- FabricEvent
- SecurityScenario

## 禁止跑偏

- 不做完整数据商城。
- 不做复杂组织权限后台。
- 不做完整 CA / 证书生命周期管理。
- 不把抗量子做成主卖点。
- 不堆大量无关 dashboard 指标。
- 不脱离 Provider Connector / Consumer Connector / Fabric 审计这条作品主线。
