import type { HandshakeResult } from "./runtime-contract.js";

export type TrustedFlowMode = "delivery" | "violation";
export type TrustedFlowStatus = "delivered" | "blocked" | "authentication_failed";
export type FieldAction = "plain" | "mask" | "encrypt" | "deny";

export type TrustedDataField = {
  field: string;
  type: string;
  sensitivityLevel: "public" | "internal" | "sensitive" | "high_sensitive";
  description: string;
};

export type TrustedDataProduct = {
  productId: string;
  name: string;
  providerDid: string;
  schemaId: string;
  sensitivityLevel: "high_sensitive";
  allowedPurposes: string[];
  policyTemplate: string;
  updatedAt: string;
  fields: TrustedDataField[];
};

export type TrustedFlowExecutionRequest = {
  mode: TrustedFlowMode;
  productId: string;
  purpose: string;
  policyVersion: 1 | 2;
};

export type TrustedFlowEvent = {
  sequence: number;
  timestamp: string;
  eventType:
    | "ConnectorRegistered"
    | "IdentityVerified"
    | "ProductPublished"
    | "DataAccessRequested"
    | "ContractActivated"
    | "PolicyUpdated"
    | "DataDelivered"
    | "ViolationDetected"
    | "AuditCommitted";
  actor: string;
  detail: string;
  digest: string;
  ledgerState: "pending-fabric" | "covered-by-fabric-receipt" | "committed-fabric" | "not-applicable";
};

export type TrustedFlowExecution = {
  traceId: string;
  startedAt: string;
  finishedAt: string;
  status: TrustedFlowStatus;
  request: TrustedFlowExecutionRequest;
  authentication: {
    source: "openhitls-hardware-ssh";
    trusted: boolean;
    handshakeId: string;
    status: HandshakeResult["status"];
    didVerification: HandshakeResult["didVerification"];
    nativeHandshakeMs: number | null;
    getNymMs: number | null;
  };
  performance: {
    resolverConnection: "observed-in-native-run";
    cacheEvidence: "not_exposed_by_native_backend";
    sessionResumeEvidence: "not_exposed_by_native_backend";
  };
  product: TrustedDataProduct;
  contract: {
    contractId: string;
    providerDid: string;
    consumerDid: string;
    productId: string;
    purpose: string;
    validFrom: string;
    validTo: string;
    policyVersion: string;
    contractHash: string;
    status: "active" | "not_activated";
  };
  fieldActionLog: Array<{ field: string; action: FieldAction; result: "delivered" | "not_delivered"; reason: string }>;
  controlledData: Record<string, string | number> | null;
  deliveryHash: string | null;
  audit: {
    backend: "fabric";
    receiptId: string;
    sequence: number;
    transactionId: string | null;
    blockNumber: string | null;
    fabricCommitted: boolean;
    channel: string;
    chaincode: string;
    notice: string;
  };
  events: TrustedFlowEvent[];
};

export type TrustedFlowTraceList = { items: TrustedFlowExecution[] };
export type TrustedDataProductList = { items: TrustedDataProduct[] };

export type FabricAuditStatus = {
  enabled: boolean;
  connected: boolean;
  status: "connected" | "unavailable" | "disabled";
  channel: string;
  chaincode: string;
  mspId: string;
  checkedAt: string;
  message: string;
};

export type FabricAuditRecord = {
  traceId: string;
  eventType: string;
  contractHash: string;
  policyVersion: string;
  timestamp: string;
  deliveryHash: string | null;
  status: TrustedFlowStatus;
  fabricTxId: string;
  channelId: string;
};
