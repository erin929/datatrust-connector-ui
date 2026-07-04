import type {
  AccessTrace,
  ConnectorIdentity,
  DIDDocument,
  DataProduct,
  DigitalContract,
  FabricEvent,
  FieldPolicy,
  SecurityScenario,
  TraceStep,
} from "../types/domain";

export const connectors: ConnectorIdentity[] = [
  {
    connectorId: "conn-provider-001",
    name: "Provider Connector",
    role: "provider",
    did: "did:example:provider001",
    certificateSanDid: "URI:did:example:provider001",
    x509Fingerprint: "sha256:8f4a9c2d7e3b6f0a91c4d2b8a77f12cc9e0a31b7",
    publicKey: "EC-P256 04:ab:cd:12:90:7f:39:aa:01:8e:73:4b",
    domain: "region-a",
    status: "active",
    trustLevel: "verified",
  },
  {
    connectorId: "conn-consumer-001",
    name: "Consumer Connector",
    role: "consumer",
    did: "did:example:consumer001",
    certificateSanDid: "URI:did:example:consumer001",
    x509Fingerprint: "sha256:a72e90ff11bc34d7e8a2c46b900c5e79de3f4512",
    publicKey: "EC-P256 04:66:19:de:81:0c:8a:45:bb:42:2d:f3",
    domain: "region-b",
    status: "active",
    trustLevel: "verified",
  },
];

export const didDocuments: DIDDocument[] = [
  {
    id: "did:example:provider001",
    controller: "org-region-a",
    serviceEndpoint: "https://provider.example.test/connector",
    status: "active",
    verificationMethod: [
      {
        id: "did:example:provider001#key-1",
        type: "EcdsaSecp256r1VerificationKey2019",
        publicKey: "EC-P256 04:ab:cd:12:90:7f:39:aa:01:8e:73:4b",
      },
    ],
  },
  {
    id: "did:example:consumer001",
    controller: "org-region-b",
    serviceEndpoint: "https://consumer.example.test/connector",
    status: "active",
    verificationMethod: [
      {
        id: "did:example:consumer001#key-1",
        type: "EcdsaSecp256r1VerificationKey2019",
        publicKey: "EC-P256 04:66:19:de:81:0c:8a:45:bb:42:2d:f3",
      },
    ],
  },
];

export const dataProduct: DataProduct = {
  productId: "prod-order-001",
  name: "订单交易数据产品",
  providerConnectorId: "conn-provider-001",
  domain: "transaction",
  description: "用于风控分析场景的订单交易结构化数据，按照数字合约执行字段级受控交付。",
  deliveryMode: "api",
  policyTemplateId: "field-level-v1",
  allowedPurposes: ["risk_analysis", "fraud_detection", "compliance_audit"],
  schema: [
    { field: "order_id", type: "string", level: "public", description: "订单编号" },
    { field: "region", type: "string", level: "internal", description: "交易区域" },
    { field: "phone", type: "string", level: "sensitive", description: "用户手机号" },
    { field: "id_card", type: "string", level: "sensitive", description: "身份证号" },
    { field: "payment_account", type: "string", level: "high_sensitive", description: "支付账户" },
  ],
};

export const fieldPoliciesV1: FieldPolicy[] = [
  { field: "order_id", action: "plain", reason: "public 字段，合约允许明文返回" },
  { field: "region", action: "plain", reason: "internal 字段，risk_analysis 用途允许返回" },
  { field: "phone", action: "mask", reason: "sensitive 字段，执行手机号脱敏" },
  { field: "id_card", action: "encrypt", reason: "sensitive 字段，执行字段级加密" },
  { field: "payment_account", action: "deny", reason: "high_sensitive 字段，当前合约拒绝返回" },
];

export const fieldPoliciesV2: FieldPolicy[] = [
  { field: "order_id", action: "plain", reason: "public 字段，合约允许明文返回" },
  { field: "region", action: "plain", reason: "internal 字段，risk_analysis 用途允许返回" },
  { field: "phone", action: "deny", reason: "策略升级后禁止手机号字段返回" },
  { field: "id_card", action: "encrypt", reason: "sensitive 字段，继续执行字段级加密" },
  { field: "payment_account", action: "deny", reason: "high_sensitive 字段，当前合约拒绝返回" },
];

export const contract: DigitalContract = {
  contractId: "contract-001",
  productId: "prod-order-001",
  providerConnectorId: "conn-provider-001",
  consumerConnectorId: "conn-consumer-001",
  purpose: "risk_analysis",
  validFrom: "2026-05-01T00:00:00Z",
  validTo: "2026-06-01T00:00:00Z",
  policyVersion: 1,
  fieldPolicies: fieldPoliciesV1,
  contractHash: "sha256:2a91f7c8b30a1d85a3f1cf9c61a71a4e9c0b1184",
  fabricTxHash: "0x8c1d7a6fe90231b44d90c7f881e2c018b62a0f11",
  status: "active",
};

export const rawRecord = {
  order_id: "O202605010001",
  region: "Shaanxi",
  phone: "13812345678",
  id_card: "610102199901018888",
  payment_account: "6222020202020001",
};

export const deliveredV1 = {
  order_id: "O202605010001",
  region: "Shaanxi",
  phone: "138****5678",
  id_card: "enc:aes256gcm:9d40f7a21c...",
  payment_account: null,
};

export const deliveredV2 = {
  order_id: "O202605010001",
  region: "Shaanxi",
  phone: null,
  id_card: "enc:aes256gcm:9d40f7a21c...",
  payment_account: null,
};

export const handshakeSteps: TraceStep[] = [
  { title: "ClientHello", detail: "Consumer 发送 DID_AUTH_MODE 扩展", status: "success" },
  { title: "ServerHello", detail: "Provider 返回 DID 认证模式", status: "success" },
  { title: "Provider Certificate", detail: "证书 SAN 中携带 did:example:provider001", status: "success" },
  { title: "DID Document Query", detail: "查询 Provider DID Document 并读取注册公钥", status: "success" },
  { title: "Public Key Match", detail: "证书公钥与 DID Document 公钥一致", status: "success" },
  { title: "Consumer Certificate", detail: "Consumer 提交 DID 证书完成 mTLS 双向认证", status: "success" },
  { title: "Handshake Complete", detail: "DID-mTLS 可信通道建立，通道安全等级 HIGH", status: "success" },
];

export const accessTrace: AccessTrace = {
  traceId: "trace-002",
  contractId: "contract-001",
  productId: "prod-order-001",
  providerDid: "did:example:provider001",
  consumerDid: "did:example:consumer001",
  policyVersion: 1,
  requestHash: "sha256:5c9b10a0c1c3a18f9e22f37c244f1d78",
  responseHash: "sha256:a1f97e35c92bb143b82f20c7712dd401",
  result: "delivered",
  fabricTxHash: "0x902bcaed19f0a31bb75c9472aa62f1",
  steps: [
    { title: "Consumer 发起请求", detail: "携带 contract-001、purpose=risk_analysis 与字段列表", status: "success" },
    { title: "校验 DID-mTLS 通道", detail: "Consumer 与 Provider 双向身份均可信", status: "success" },
    { title: "命中数字合约", detail: "contract-001 处于 active，有效期覆盖当前访问", status: "success" },
    { title: "加载策略版本", detail: "policyVersion=v1，字段策略开始执行", status: "success" },
    { title: "字段级受控交付", detail: "plain / mask / encrypt / deny 按字段处理", status: "success" },
    { title: "写入 Fabric 审计", detail: "记录 DataDelivered 事件、responseHash 与 traceId", status: "success" },
  ],
};

export const fabricEvents: FabricEvent[] = [
  { eventId: "evt-001", eventType: "ConnectorRegistered", relatedId: "conn-provider-001", txHash: "0xabc101", timestamp: "10:00:01" },
  { eventId: "evt-002", eventType: "ConnectorRegistered", relatedId: "conn-consumer-001", txHash: "0xabc102", timestamp: "10:00:03" },
  { eventId: "evt-003", eventType: "ContractSigned", relatedId: "contract-001", policyVersion: 1, bodyHash: contract.contractHash, txHash: contract.fabricTxHash, timestamp: "10:02:25" },
  { eventId: "evt-004", eventType: "DataAccessRequested", relatedId: "prod-order-001", traceId: "trace-002", policyVersion: 1, bodyHash: accessTrace.requestHash, txHash: "0x901f10", timestamp: "10:03:18" },
  { eventId: "evt-005", eventType: "DataDelivered", relatedId: "prod-order-001", traceId: "trace-002", policyVersion: 1, bodyHash: accessTrace.responseHash, txHash: accessTrace.fabricTxHash, timestamp: "10:03:19" },
  { eventId: "evt-006", eventType: "PolicyUpdated", relatedId: "policy-order", policyVersion: 2, bodyHash: "sha256:7e40b19f8d01", txHash: "0x903a44", timestamp: "10:05:40" },
  { eventId: "evt-007", eventType: "ViolationDetected", relatedId: "prod-order-001", traceId: "trace-003", policyVersion: 2, bodyHash: "sha256:blocked", txHash: "0x904f88", timestamp: "10:06:01" },
];

export const securityScenarios: SecurityScenario[] = [
  {
    id: "scenario-did-not-found",
    name: "未注册 DID",
    inputRisk: "证书 SAN DID 指向 did:example:attacker001，但身份目录不存在",
    interceptionPoint: "DID Document 查询",
    result: "拒绝接入并写入 ViolationDetected",
    severity: "high",
    logs: [
      "收到 Consumer 连接请求",
      "提取证书 SAN DID: did:example:attacker001",
      "查询 DID Document: not found",
      "DID 验证失败: DID_VERIFY_DID_NOT_FOUND",
      "拒绝连接，发送 bad_certificate alert",
    ],
  },
  {
    id: "scenario-key-mismatch",
    name: "证书与 DID 公钥不一致",
    inputRisk: "证书公钥与 DID Document verificationMethod 公钥不匹配",
    interceptionPoint: "公钥一致性校验",
    result: "DID-mTLS 握手失败",
    severity: "high",
    logs: ["解析对端证书成功", "读取 DID Document 公钥", "比对证书公钥与 DID 公钥", "公钥不一致，拒绝连接"],
  },
  {
    id: "scenario-field-overreach",
    name: "越权字段访问",
    inputRisk: "Consumer 请求 payment_account 高敏字段",
    interceptionPoint: "字段策略引擎",
    result: "字段返回 null，并记录访问摘要",
    severity: "medium",
    logs: ["合约状态 active", "命中 policyVersion v1", "payment_account action=deny", "字段拒绝返回"],
  },
  {
    id: "scenario-contract-expired",
    name: "过期合约调用",
    inputRisk: "validTo 已过期但 Consumer 继续调用数据产品",
    interceptionPoint: "合约状态检查",
    result: "拒绝调用并记录违规事件",
    severity: "medium",
    logs: ["读取 contract-001", "检查 validTo", "合约已过期", "阻断数据调用并写入审计事件"],
  },
];
