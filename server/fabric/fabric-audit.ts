import * as grpc from "@grpc/grpc-js";
import { connect, hash, signers, type Contract, type Gateway } from "@hyperledger/fabric-gateway";
import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  FabricAuditRecord,
  FabricAuditStatus,
  TrustedFlowExecution,
} from "../../shared/trusted-flow-contract.js";

type FabricConnection = {
  client: grpc.Client;
  contract: Contract;
  gateway: Gateway;
};

type FabricConfig = {
  enabled: boolean;
  peerEndpoint: string;
  peerHostAlias: string;
  mspId: string;
  channel: string;
  chaincode: string;
  tlsRootCert: string;
  identityCert: string;
  identityKey: string;
};

export type FabricCommitReceipt = {
  blockNumber: string;
  transactionId: string;
};

const networkRoot = path.resolve(process.cwd(), "fabric-network");

let configCache: FabricConfig | null = null;

function getConfig(): FabricConfig {
  if (configCache) return configCache;
  configCache = {
    enabled: process.env.FABRIC_AUDIT_ENABLED?.trim().toLowerCase() === "true",
    peerEndpoint: process.env.FABRIC_PEER_ENDPOINT?.trim() || "192.168.50.21:7051",
    peerHostAlias: process.env.FABRIC_PEER_HOST_ALIAS?.trim() || "peer0.org1.datatrust.local",
    mspId: process.env.FABRIC_MSP_ID?.trim() || "Org1MSP",
    channel: process.env.FABRIC_CHANNEL?.trim() || "datatrustchannel",
    chaincode: process.env.FABRIC_CHAINCODE?.trim() || "datatrust-audit",
    tlsRootCert: path.resolve(
      process.env.FABRIC_TLS_ROOT_CERT?.trim() ||
        path.join(networkRoot, "crypto-config/peerOrganizations/org1.datatrust.local/peers/peer0.org1.datatrust.local/tls/ca.crt"),
    ),
    identityCert: path.resolve(
      process.env.FABRIC_IDENTITY_CERT?.trim() ||
        path.join(networkRoot, "crypto-config/peerOrganizations/org1.datatrust.local/users/User1@org1.datatrust.local/msp/signcerts/User1@org1.datatrust.local-cert.pem"),
    ),
    identityKey: path.resolve(
      process.env.FABRIC_IDENTITY_KEY?.trim() ||
        path.join(networkRoot, "crypto-config/peerOrganizations/org1.datatrust.local/users/User1@org1.datatrust.local/msp/keystore/priv_sk"),
    ),
  };
  return configCache;
}

function deadline(milliseconds: number) {
  return new Date(Date.now() + milliseconds);
}

function openConnection(config = getConfig()): FabricConnection {
  if (!config.enabled) throw new Error("Fabric audit is disabled");
  const tlsCredentials = grpc.credentials.createSsl(readFileSync(config.tlsRootCert));
  const client = new grpc.Client(config.peerEndpoint, tlsCredentials, {
    "grpc.ssl_target_name_override": config.peerHostAlias,
    "grpc.default_authority": config.peerHostAlias,
  });
  const gateway = connect({
    client,
    identity: { mspId: config.mspId, credentials: readFileSync(config.identityCert) },
    signer: signers.newPrivateKeySigner(createPrivateKey(readFileSync(config.identityKey))),
    hash: hash.sha256,
    evaluateOptions: () => ({ deadline: deadline(8_000) }),
    endorseOptions: () => ({ deadline: deadline(15_000) }),
    submitOptions: () => ({ deadline: deadline(8_000) }),
    commitStatusOptions: () => ({ deadline: deadline(30_000) }),
  });
  const contract = gateway.getNetwork(config.channel).getContract(config.chaincode);
  return { client, gateway, contract };
}

function closeConnection(connection: FabricConnection) {
  connection.gateway.close();
  connection.client.close();
}

let statusCache: { expiresAt: number; value: FabricAuditStatus } | null = null;

export async function getFabricAuditStatus(force = false): Promise<FabricAuditStatus> {
  if (!force && statusCache && statusCache.expiresAt > Date.now()) return statusCache.value;
  const config = getConfig();
  const checkedAt = new Date().toISOString();
  if (!config.enabled) {
    return {
      enabled: false,
      connected: false,
      status: "disabled",
      channel: config.channel,
      chaincode: config.chaincode,
      mspId: config.mspId,
      checkedAt,
      message: "Fabric 审计已通过配置禁用。",
    };
  }

  let connection: FabricConnection | null = null;
  try {
    connection = openConnection();
    const response = await connection.contract.evaluateTransaction("AuditExists", "__gateway_healthcheck__");
    if (Buffer.from(response).toString("utf8") !== "false") throw new Error("unexpected health-check response");
    const value: FabricAuditStatus = {
      enabled: true,
      connected: true,
      status: "connected",
      channel: config.channel,
      chaincode: config.chaincode,
      mspId: config.mspId,
      checkedAt,
      message: "Fabric Peer 与审计链码可访问；双组织背书将在交易提交时验证。",
    };
    statusCache = { value, expiresAt: Date.now() + 5_000 };
    return value;
  } catch (error) {
    const value: FabricAuditStatus = {
      enabled: true,
      connected: false,
      status: "unavailable",
      channel: config.channel,
      chaincode: config.chaincode,
      mspId: config.mspId,
      checkedAt,
      message: error instanceof Error ? error.message : String(error),
    };
    statusCache = { value, expiresAt: Date.now() + 3_000 };
    return value;
  } finally {
    if (connection) closeConnection(connection);
  }
}

export async function commitFabricAudit(execution: TrustedFlowExecution): Promise<FabricCommitReceipt> {
  const terminalEvent = execution.events[execution.events.length - 1];
  const payload = {
    traceId: execution.traceId,
    eventType: terminalEvent?.eventType ?? "IdentityVerified",
    contractHash: execution.contract.contractHash,
    policyVersion: execution.contract.policyVersion,
    timestamp: execution.finishedAt,
    deliveryHash: execution.deliveryHash,
    status: execution.status,
  };
  const connection = openConnection();
  try {
    const proposal = connection.contract.newProposal("RecordAudit", {
      arguments: [JSON.stringify(payload)],
      endorsingOrganizations: ["Org1MSP", "Org2MSP"],
    });
    const endorsed = await proposal.endorse();
    const transactionId = endorsed.getTransactionId();
    const submitted = await endorsed.submit();
    const status = await submitted.getStatus();
    if (!status.successful) throw new Error(`Fabric transaction ${transactionId} failed validation with code ${status.code}`);
    statusCache = null;
    return { transactionId, blockNumber: status.blockNumber.toString() };
  } finally {
    closeConnection(connection);
  }
}

export async function getFabricAudit(traceId: string): Promise<FabricAuditRecord> {
  const connection = openConnection();
  try {
    const response = await connection.contract.evaluateTransaction("GetAudit", traceId);
    return JSON.parse(Buffer.from(response).toString("utf8")) as FabricAuditRecord;
  } finally {
    closeConnection(connection);
  }
}
