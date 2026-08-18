import assert from "node:assert/strict";
import test from "node:test";
import type { HandshakeLogEntry } from "../shared/runtime-contract.js";
import { parseNativeOutcome } from "./handshake-parser.js";

function logs(...messages: string[]): HandshakeLogEntry[] {
  return messages.map((message, sequence) => ({
    sequence,
    source: "client",
    stream: "stdout",
    level: message.includes("ERROR") ? "error" : "info",
    message,
  }));
}

test("reports DID success only with positive GET_NYM evidence", () => {
  const outcome = parseNativeOutcome(logs("认证模式: DID TLS", "TLS握手完成，用时: 37 ms", "[INFO] ✓ GET_NYM链上查询成功 (耗时: 3.2 ms)"), "did", 0, false);
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.nativeHandshakeMs, 37);
  assert.equal(outcome.didVerification.name, "DID_VERIFY_SUCCESS");
});

test("recognizes the latest hardware handshake success format", () => {
  const outcome = parseNativeOutcome(
    logs(
      "[DEBUG] peer certificate dumped: /tmp/did_peer_cert.der, len=414",
      "[INDY_VERKEY_OK] FAe4sisG95oZ42w7buUn5qEE4TAnfTTFPiguZUHmhiF",
      "[INFO] ✓ GET_NYM链上查询成功 (耗时: 57.387 ms)",
      "[INFO] ✓ DID公钥验证成功\\n[INFO] TLS handshake SUCCESS, time: 73 ms",
    ),
    "did",
    0,
    false,
  );

  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.completed, true);
  assert.equal(outcome.nativeHandshakeMs, 73);
  assert.equal(outcome.didVerification.status, "succeeded");
  assert.equal(outcome.didVerification.name, "DID_VERIFY_SUCCESS");
});

test("does not claim on-chain DID success when Indy-VDR was disabled", () => {
  const outcome = parseNativeOutcome(
    logs(
      "[WARN] Indy-VDR initialization failed, blockchain verification will be disabled",
      "TLS握手完成，用时: 18 ms",
    ),
    "did",
    0,
    false,
  );
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.didVerification.status, "failed");
  assert.equal(outcome.didVerification.name, "DID_VERIFY_BLOCKCHAIN_FAIL");
  assert.equal(outcome.didVerification.verifyOnChain, false);
});
test("preserves a detailed DID verification failure next to the HITLS code", () => {
  const outcome = parseNativeOutcome(
    logs("[ERROR] TLS握手失败: 0x20c0020", "验证失败原因: 公钥不匹配"),
    "did",
    1,
    false,
  );
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.hitlsCode, "0x20c0020");
  assert.equal(outcome.didVerification.code, 4);
  assert.equal(outcome.didVerification.name, "DID_VERIFY_PUBKEY_MISMATCH");
});

test("recognizes the unregistered DID output used by the board build", () => {
  const outcome = parseNativeOutcome(
    logs("[ERROR] data字段为null，DID未注册或无数据"),
    "did",
    1,
    false,
  );
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.didVerification.name, "DID_VERIFY_DID_NOT_FOUND");
});

test("marks a killed native process as timed out", () => {
  const outcome = parseNativeOutcome(logs("开始TLS握手..."), "traditional", null, true);
  assert.equal(outcome.status, "timed_out");
  assert.equal(outcome.didVerification.status, "not_run");
});
