import assert from "node:assert/strict";
import test from "node:test";
import type { HandshakeLogEntry } from "../shared/runtime-contract.js";
import { parseNativeOutcome } from "./handshake-parser.js";

function logs(...messages: string[]): HandshakeLogEntry[] {
  return messages.map((message, sequence) => ({
    sequence,
    stream: "stdout",
    level: message.includes("ERROR") ? "error" : "info",
    message,
  }));
}

test("parses a successful native DID handshake", () => {
  const outcome = parseNativeOutcome(logs("认证模式: DID TLS", "握手完成，用时: 37 ms"), "did", 0, false);
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.nativeHandshakeMs, 37);
  assert.equal(outcome.didVerification.name, "DID_VERIFY_SUCCESS");
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

test("marks a killed native process as timed out", () => {
  const outcome = parseNativeOutcome(logs("开始TLS握手..."), "traditional", null, true);
  assert.equal(outcome.status, "timed_out");
  assert.equal(outcome.didVerification.status, "not_run");
});
