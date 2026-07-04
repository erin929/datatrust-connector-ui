export type ConnectorRole = "provider" | "consumer";
export type ConnectorStatus = "active" | "revoked" | "suspended";
export type TrustLevel = "verified" | "unverified" | "risk";

export type ConnectorIdentity = {
  connectorId: string;
  name: string;
  role: ConnectorRole;
  did: string;
  x509Fingerprint: string;
  publicKey: string;
  domain: string;
  status: ConnectorStatus;
  trustLevel: TrustLevel;
  certificateSanDid: string;
};

export type DIDDocument = {
  id: string;
  controller: string;
  verificationMethod: {
    id: string;
    type: string;
    publicKey: string;
  }[];
  serviceEndpoint: string;
  status: ConnectorStatus;
};

export type FieldLevel = "public" | "internal" | "sensitive" | "high_sensitive";
export type FieldAction = "plain" | "mask" | "encrypt" | "deny";

export type DataField = {
  field: string;
  type: string;
  level: FieldLevel;
  description: string;
};

export type DataProduct = {
  productId: string;
  name: string;
  providerConnectorId: string;
  domain: string;
  description: string;
  deliveryMode: "api";
  policyTemplateId: string;
  allowedPurposes: string[];
  schema: DataField[];
};

export type FieldPolicy = {
  field: string;
  action: FieldAction;
  reason: string;
};

export type DigitalContract = {
  contractId: string;
  productId: string;
  providerConnectorId: string;
  consumerConnectorId: string;
  purpose: string;
  validFrom: string;
  validTo: string;
  policyVersion: number;
  fieldPolicies: FieldPolicy[];
  contractHash: string;
  fabricTxHash: string;
  status: "draft" | "active" | "expired" | "revoked";
};

export type TraceStep = {
  title: string;
  detail: string;
  status: "success" | "warning" | "error" | "pending";
};

export type AccessTrace = {
  traceId: string;
  contractId: string;
  productId: string;
  providerDid: string;
  consumerDid: string;
  policyVersion: number;
  requestHash: string;
  responseHash: string;
  result: "delivered" | "denied" | "violation";
  fabricTxHash: string;
  steps: TraceStep[];
};

export type FabricEvent = {
  eventId: string;
  eventType:
    | "ConnectorRegistered"
    | "ContractSigned"
    | "PolicyUpdated"
    | "DataAccessRequested"
    | "DataDelivered"
    | "ViolationDetected"
    | "ProofSubmitted";
  relatedId: string;
  traceId?: string;
  policyVersion?: number;
  bodyHash?: string;
  txHash: string;
  timestamp: string;
};

export type SecurityScenario = {
  id: string;
  name: string;
  inputRisk: string;
  interceptionPoint: string;
  result: string;
  severity: "high" | "medium" | "low";
  logs: string[];
};
