"use strict";

const shim = require("fabric-shim");

const forbiddenKeys = new Set(["rawData", "controlledData", "id_card", "phone", "payment_account", "decryptKey"]);

function validateAuditPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("audit payload must be an object");
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`sensitive field is forbidden on-chain: ${key}`);
  }
  for (const required of ["traceId", "eventType", "contractHash", "policyVersion", "timestamp"]) {
    if (typeof value[required] !== "string" || !value[required]) throw new Error(`missing required audit field: ${required}`);
  }
  if (value.deliveryHash !== null && typeof value.deliveryHash !== "string") throw new Error("deliveryHash must be a string or null");
  return value;
}

class AuditChaincode {
  async Init() {
    return shim.success(Buffer.from("DataTrust audit chaincode ready"));
  }

  async Invoke(stub) {
    try {
      const { fcn, params } = stub.getFunctionAndParameters();
      if (fcn === "RecordAudit") return this.recordAudit(stub, params);
      if (fcn === "GetAudit") return this.getAudit(stub, params);
      if (fcn === "AuditExists") return this.auditExists(stub, params);
      return shim.error(Buffer.from(`unsupported function: ${fcn}`));
    } catch (error) {
      return shim.error(Buffer.from(error instanceof Error ? error.message : String(error)));
    }
  }

  async recordAudit(stub, params) {
    if (params.length !== 1) throw new Error("RecordAudit expects one JSON argument");
    const payload = validateAuditPayload(JSON.parse(params[0]));
    const key = `audit:${payload.traceId}`;
    const existing = await stub.getState(key);
    if (existing && existing.length) throw new Error(`audit record already exists: ${payload.traceId}`);
    const record = { ...payload, fabricTxId: stub.getTxID(), channelId: stub.getChannelID() };
    await stub.putState(key, Buffer.from(JSON.stringify(record)));
    stub.setEvent("AuditRecorded", Buffer.from(JSON.stringify({ traceId: payload.traceId, eventType: payload.eventType })));
    return shim.success(Buffer.from(JSON.stringify(record)));
  }

  async getAudit(stub, params) {
    if (params.length !== 1 || !params[0]) throw new Error("GetAudit expects traceId");
    const value = await stub.getState(`audit:${params[0]}`);
    if (!value || !value.length) throw new Error(`audit record not found: ${params[0]}`);
    return shim.success(value);
  }

  async auditExists(stub, params) {
    if (params.length !== 1 || !params[0]) throw new Error("AuditExists expects traceId");
    const value = await stub.getState(`audit:${params[0]}`);
    return shim.success(Buffer.from(value && value.length ? "true" : "false"));
  }
}

shim.server(new AuditChaincode(), {
  ccid: process.env.CORE_CHAINCODE_ID,
  address: process.env.CORE_CHAINCODE_ADDRESS,
}).start();
