import { createHash, randomUUID } from "node:crypto";
import type { HandshakeResult } from "../../shared/runtime-contract.js";
import type {
  FieldAction,
  TrustedDataProduct,
  TrustedFlowEvent,
  TrustedFlowExecution,
  TrustedFlowExecutionRequest,
} from "../../shared/trusted-flow-contract.js";

const products: TrustedDataProduct[] = [
  {
    productId: "prod-order-risk-001",
    name: "订单风控数据",
    providerDid: "did:indy:Provider7F3",
    schemaId: "order-risk/v1",
    sensitivityLevel: "high_sensitive",
    allowedPurposes: ["order-risk-analysis", "fraud-detection", "compliance-audit"],
    policyTemplate: "order-field-policy",
    updatedAt: "2026-08-18T14:30:00.000Z",
    fields: [
      { field: "order_id", type: "string", sensitivityLevel: "public", description: "订单编号" },
      { field: "amount", type: "number", sensitivityLevel: "internal", description: "订单金额" },
      { field: "customer_name", type: "string", sensitivityLevel: "internal", description: "客户姓名" },
      { field: "phone", type: "string", sensitivityLevel: "sensitive", description: "手机号" },
      { field: "id_card", type: "string", sensitivityLevel: "high_sensitive", description: "身份证号" },
      { field: "payment_account", type: "string", sensitivityLevel: "high_sensitive", description: "支付账户" },
    ],
  },
];

const rawRecords: Record<string, Record<string, string | number>> = {
  "prod-order-risk-001": {
    order_id: "ORD202607020001",
    amount: 1688.5,
    customer_name: "Alice Zhang",
    phone: "13812345678",
    id_card: "610102199901018888",
    payment_account: "6222021234567890",
  },
};

const executions: TrustedFlowExecution[] = [];
let localLedgerSequence = 0;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown) {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function shortId(prefix: string) {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function extractGetNymMs(handshake: HandshakeResult) {
  for (const entry of handshake.logs) {
    const match = entry.message.match(/GET_NYM[^\d]*(\d+(?:\.\d+)?)\s*ms/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function mask(value: string) {
  if (value.length <= 4) return "****";
  if (/^\d{11}$/.test(value)) return `${value.slice(0, 3)}****${value.slice(-4)}`;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function encrypt(value: string) {
  return `ENC:${createHash("sha256").update(value).digest("hex").slice(0, 16).toUpperCase()}`;
}

function policyFor(field: string, version: 1 | 2): { action: FieldAction; reason: string } {
  const policies: Record<string, { action: FieldAction; reason: string }> = {
    order_id: { action: "plain", reason: "公开字段，合约允许明文返回" },
    amount: { action: "plain", reason: "风险分析用途允许金额明文" },
    customer_name: { action: "mask", reason: "内部字段仅交付脱敏姓名" },
    phone: version === 2 ? { action: "deny", reason: "v2 策略禁止手机号交付" } : { action: "mask", reason: "敏感字段执行手机号脱敏" },
    id_card: { action: "deny", reason: "高敏感字段拒绝交付" },
    payment_account: { action: "encrypt", reason: "高敏感字段仅允许加密交付" },
  };
  return policies[field] ?? { action: "deny", reason: "字段未配置策略，默认拒绝" };
}

function createEvent(events: TrustedFlowEvent[], eventType: TrustedFlowEvent["eventType"], actor: string, detail: string, payload: unknown) {
  events.push({
    sequence: events.length + 1,
    timestamp: new Date().toISOString(),
    eventType,
    actor,
    detail,
    digest: digest({ eventType, payload }),
    ledgerState: "pending-fabric",
  });
}

export function listTrustedProducts() {
  return products;
}

export function listTrustedFlowExecutions() {
  return executions.slice(0, 100);
}

export function getTrustedFlowExecution(traceId: string) {
  return executions.find((execution) => execution.traceId === traceId) ?? null;
}

export function validateTrustedFlowRequest(value: unknown): TrustedFlowExecutionRequest {
  if (!value || typeof value !== "object") throw new Error("请求体必须是 JSON 对象。\n");
  const candidate = value as Partial<TrustedFlowExecutionRequest>;
  if (candidate.mode !== "delivery" && candidate.mode !== "violation") throw new Error("mode 必须是 delivery 或 violation。\n");
  const product = products.find((item) => item.productId === candidate.productId);
  if (!product) throw new Error("productId 对应的数据产品不存在。\n");
  if (typeof candidate.purpose !== "string" || !product.allowedPurposes.includes(candidate.purpose)) throw new Error("purpose 不在数据产品允许用途范围内。\n");
  if (candidate.policyVersion !== 1 && candidate.policyVersion !== 2) throw new Error("policyVersion 必须是 1 或 2。\n");
  return candidate as TrustedFlowExecutionRequest;
}

export function executeTrustedFlow(request: TrustedFlowExecutionRequest, handshake: HandshakeResult): TrustedFlowExecution {
  const startedAt = new Date().toISOString();
  const traceId = shortId("trace");
  const product = products.find((item) => item.productId === request.productId)!;
  const trusted = handshake.status === "succeeded" && handshake.connection.completed && handshake.didVerification.status === "succeeded";
  const consumerDid = "did:indy:Consumer9A2";
  const contractId = shortId("contract");
  const contractCore = {
    contractId,
    providerDid: product.providerDid,
    consumerDid,
    productId: product.productId,
    purpose: request.purpose,
    validFrom: startedAt,
    validTo: new Date(Date.parse(startedAt) + 7 * 24 * 60 * 60 * 1000).toISOString(),
    policyVersion: `v${request.policyVersion}`,
  };
  const contractHash = digest(contractCore);
  const events: TrustedFlowEvent[] = [];
  createEvent(events, "ConnectorRegistered", "Connector Gateway", "通信双方连接器上下文已登记", { traceId, providerDid: product.providerDid, consumerDid });
  createEvent(events, "IdentityVerified", "openHiTLS-DID", trusted ? "硬件 DID-mTLS 身份认证通过" : "硬件 DID-mTLS 身份认证失败，后续授权被阻断", { handshakeId: handshake.id, trusted, didVerification: handshake.didVerification });

  let controlledData: Record<string, string | number> | null = null;
  let deliveryHash: string | null = null;
  const fieldActionLog: TrustedFlowExecution["fieldActionLog"] = [];
  let status: TrustedFlowExecution["status"] = "authentication_failed";

  if (trusted) {
    createEvent(events, "ProductPublished", "Provider Connector", "数据产品元数据已提供给可信 Consumer", { productId: product.productId, schemaId: product.schemaId });
    createEvent(events, "DataAccessRequested", "Consumer Connector", "Consumer 按声明用途发起数据访问申请", request);
    createEvent(events, "ContractActivated", "Contract Service", "数字合约已激活并绑定双方身份、用途和策略版本", { contractId, contractHash });
    createEvent(events, "PolicyUpdated", "Policy Engine", `字段策略 v${request.policyVersion} 已绑定`, { policyVersion: request.policyVersion, template: product.policyTemplate });

    if (request.mode === "violation") {
      status = "blocked";
      fieldActionLog.push({ field: "payment_account", action: "deny", result: "not_delivered", reason: "越权请求明文读取高敏感支付账户" });
      createEvent(events, "ViolationDetected", "Policy Engine", "payment_account 越权明文请求已阻断，未产生交付数据", { field: "payment_account", requestedAction: "plain" });
    } else {
      status = "delivered";
      controlledData = {};
      const rawData = rawRecords[product.productId];
      for (const [field, value] of Object.entries(rawData)) {
        const policy = policyFor(field, request.policyVersion);
        if (policy.action === "plain") controlledData[field] = value;
        if (policy.action === "mask") controlledData[field] = mask(String(value));
        if (policy.action === "encrypt") controlledData[field] = encrypt(String(value));
        if (policy.action === "deny") controlledData[field] = "DENIED";
        fieldActionLog.push({ field, action: policy.action, result: policy.action === "deny" ? "not_delivered" : "delivered", reason: policy.reason });
      }
      deliveryHash = digest(controlledData);
      createEvent(events, "DataDelivered", "Provider Connector", "最小必要字段已完成受控交付", { deliveryHash, fieldActionLog });
    }
  }

  localLedgerSequence += 1;
  const execution: TrustedFlowExecution = {
    traceId,
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
    request,
    authentication: {
      source: "openhitls-hardware-ssh",
      trusted,
      handshakeId: handshake.id,
      status: handshake.status,
      didVerification: handshake.didVerification,
      nativeHandshakeMs: handshake.connection.nativeHandshakeMs,
      getNymMs: extractGetNymMs(handshake),
    },
    performance: {
      resolverConnection: "observed-in-native-run",
      cacheEvidence: "not_exposed_by_native_backend",
      sessionResumeEvidence: "not_exposed_by_native_backend",
    },
    product,
    contract: { ...contractCore, contractHash, status: trusted ? "active" : "not_activated" },
    fieldActionLog,
    controlledData,
    deliveryHash,
    audit: {
      backend: "fabric",
      receiptId: shortId("receipt"),
      sequence: localLedgerSequence,
      transactionId: null,
      blockNumber: null,
      fabricCommitted: false,
      channel: "datatrustchannel",
      chaincode: "datatrust-audit",
      notice: "正在等待双组织 Fabric 背书与提交确认。",
    },
    events,
  };
  return execution;
}

export function finalizeTrustedFlowExecution(
  execution: TrustedFlowExecution,
  receipt: { transactionId: string; blockNumber: string },
) {
  execution.audit.transactionId = receipt.transactionId;
  execution.audit.blockNumber = receipt.blockNumber;
  execution.audit.fabricCommitted = true;
  execution.audit.notice = "审计摘要已由 Org1 与 Org2 共同背书，并在 Fabric 通道中提交为 VALID。";
  for (const event of execution.events) event.ledgerState = "covered-by-fabric-receipt";
  createEvent(
    execution.events,
    "AuditCommitted",
    "Hyperledger Fabric",
    "审计摘要已完成双组织背书并提交上链",
    receipt,
  );
  const committedEvent = execution.events[execution.events.length - 1];
  if (committedEvent) committedEvent.ledgerState = "committed-fabric";
  execution.finishedAt = new Date().toISOString();
  return execution;
}

export function recordTrustedFlowExecution(execution: TrustedFlowExecution) {
  executions.unshift(execution);
  if (executions.length > 100) executions.length = 100;
  return execution;
}
