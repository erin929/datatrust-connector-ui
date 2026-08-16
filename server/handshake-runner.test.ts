import assert from "node:assert/strict";
import test from "node:test";
import type { HandshakeRequest } from "../shared/runtime-contract.js";
import { GatewayError } from "./gateway-error.js";
import { buildNativeArgs } from "./handshake-runner.js";
import type { NativeRuntimeConfig } from "./runtime-config.js";

const config: NativeRuntimeConfig = {
  status: "ready",
  reason: null,
  executablePath: "unified_tls_client",
  executableName: "unified_tls_client",
  workingDirectory: ".",
  prefixArgs: [],
  target: { host: "127.0.0.1", port: 12346 },
  didCertificatePath: null,
  didKeyPath: null,
};

function request(overrides: Partial<HandshakeRequest>): HandshakeRequest {
  return { authMode: "traditional", mutualTls: false, timeoutMs: 15000, ...overrides };
}

test("builds the native traditional TLS argument list", () => {
  assert.deepEqual(buildNativeArgs(config, request({})), ["--auth-mode", "traditional"]);
  assert.deepEqual(buildNativeArgs(config, request({ mutualTls: true })), ["--auth-mode", "traditional", "--mtls"]);
});

test("allows single-sided DID verification without a client certificate", () => {
  assert.deepEqual(buildNativeArgs(config, request({ authMode: "did" })), ["--auth-mode", "did"]);
  assert.deepEqual(buildNativeArgs(config, request({ authMode: "auto" })), ["--auth-mode", "auto"]);
});

test("requires a configured DID certificate only when DID mTLS is enabled", () => {
  assert.throws(
    () => buildNativeArgs(config, request({ authMode: "did", mutualTls: true })),
    (error) => error instanceof GatewayError && error.code === "DID_CERT_PROFILE_NOT_CONFIGURED",
  );
});
