import assert from "node:assert/strict";
import test from "node:test";
import type { HandshakeResult } from "../../shared/runtime-contract.js";
import { executeTrustedFlow, validateTrustedFlowRequest } from "./trusted-flow-service.js";

function handshake(trusted: boolean): HandshakeResult {
  return {
    id: `hs-${trusted ? "pass" : "fail"}`,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: trusted ? "succeeded" : "failed",
    request: { scenario: "did_mtls", authMode: "did", mutualTls: true, timeoutMs: 30000 },
    process: { exitCode: trusted ? 0 : 1, signal: null, client: { exitCode: trusted ? 0 : 1, signal: null }, server: { exitCode: 0, signal: null } },
    connection: { target: { host: "127.0.0.1", port: 4433 }, completed: trusted, durationMs: 90, nativeHandshakeMs: 82, hitlsCode: null, tlsAlert: null, tlsVersion: "TLSv1.3" },
    negotiation: { localCertificateMode: "DID", peerCertificateMode: "DID", clientDidAuthMode: 1, serverDidAuthMode: 1, fallbackMode: false },
    didVerification: { status: trusted ? "succeeded" : "failed", code: trusted ? 0 : 4, name: trusted ? "DID_VERIFY_SUCCESS" : "DID_VERIFY_PUBKEY_MISMATCH", message: null, verifyOnChain: true },
    logs: [{ sequence: 1, source: "client", stream: "stdout", level: "info", message: "GET_NYM completed in 60.7 ms" }],
  };
}

test("delivery executes field policy and produces real hashes", () => {
  const request = validateTrustedFlowRequest({ mode: "delivery", productId: "prod-order-risk-001", purpose: "order-risk-analysis", policyVersion: 1 });
  const result = executeTrustedFlow(request, handshake(true));
  assert.equal(result.status, "delivered");
  assert.equal(result.authentication.getNymMs, 60.7);
  assert.match(result.contract.contractHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.deliveryHash ?? "", /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.controlledData?.phone, "138****5678");
  assert.equal(result.controlledData?.id_card, "DENIED");
  assert.equal(result.audit.backend, "fabric");
  assert.equal(result.audit.fabricCommitted, false);
  assert.equal(result.audit.transactionId, null);
  assert.equal(result.events[result.events.length - 1]?.eventType, "DataDelivered");
});

test("violation is blocked before delivery", () => {
  const request = validateTrustedFlowRequest({ mode: "violation", productId: "prod-order-risk-001", purpose: "fraud-detection", policyVersion: 2 });
  const result = executeTrustedFlow(request, handshake(true));
  assert.equal(result.status, "blocked");
  assert.equal(result.controlledData, null);
  assert.equal(result.deliveryHash, null);
  assert.equal(result.events[result.events.length - 1]?.eventType, "ViolationDetected");
});

test("failed hardware identity never activates the contract", () => {
  const request = validateTrustedFlowRequest({ mode: "delivery", productId: "prod-order-risk-001", purpose: "compliance-audit", policyVersion: 1 });
  const result = executeTrustedFlow(request, handshake(false));
  assert.equal(result.status, "authentication_failed");
  assert.equal(result.contract.status, "not_activated");
  assert.equal(result.fieldActionLog.length, 0);
  assert.equal(result.events.length, 2);
});
