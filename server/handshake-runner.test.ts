import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { HandshakeRequest } from "../shared/runtime-contract.js";
import { GatewayError } from "./gateway-error.js";
import {
  buildHardwareClientArgs,
  buildHardwareServerArgs,
  buildNativeArgs,
} from "./handshake-runner.js";
import type { NativeRuntimeConfig } from "./runtime-config.js";

const config: NativeRuntimeConfig = {
  transport: "local",
  status: "ready",
  reason: null,
  executablePath: "unified_tls_client",
  executableName: "unified_tls_client",
  workingDirectory: ".",
  prefixArgs: [],
  target: { host: "127.0.0.1", port: 12346 },
  didCertificatePath: null,
  didKeyPath: null,
  indyGenesisPath: null,
  managedServer: {
    enabled: false,
    executablePath: null,
    executableName: null,
    workingDirectory: ".",
    didCertificatePath: null,
    didKeyPath: null,
    startupTimeoutMs: 3000,
  },
  ssh: null,
};

function request(overrides: Partial<HandshakeRequest>): HandshakeRequest {
  return { authMode: "traditional", mutualTls: false, timeoutMs: 15000, ...overrides };
}

const existingGenesisFixture = fileURLToPath(new URL("../package.json", import.meta.url));

test("builds the native traditional TLS argument list", () => {
  assert.deepEqual(buildNativeArgs(config, request({})), [
    "--auth-mode", "traditional", "--host", "127.0.0.1", "--port", "12346",
  ]);
  assert.deepEqual(buildNativeArgs(config, request({ mutualTls: true })), [
    "--auth-mode", "traditional", "--host", "127.0.0.1", "--port", "12346", "--mtls",
  ]);
});

test("allows single-sided DID verification without a client certificate", () => {
  const didConfig = { ...config, indyGenesisPath: existingGenesisFixture };
  assert.deepEqual(buildNativeArgs(didConfig, request({ authMode: "did" })), [
    "--auth-mode", "did", "--host", "127.0.0.1", "--port", "12346",
  ]);
  assert.deepEqual(buildNativeArgs(didConfig, request({ authMode: "auto" })), [
    "--auth-mode", "auto", "--host", "127.0.0.1", "--port", "12346",
  ]);
});

test("requires a configured DID certificate only when DID mTLS is enabled", () => {
  const didConfig = { ...config, indyGenesisPath: existingGenesisFixture };
  assert.throws(
    () => buildNativeArgs(didConfig, request({ authMode: "did", mutualTls: true })),
    (error) => error instanceof GatewayError && error.code === "DID_CERT_PROFILE_NOT_CONFIGURED",
  );
});

test("does not claim DID execution without an Indy genesis file", () => {
  assert.throws(
    () => buildNativeArgs(config, request({ authMode: "did" })),
    (error) => error instanceof GatewayError && error.code === "INDY_LEDGER_NOT_CONFIGURED",
  );
});

const hardwareConfig: NativeRuntimeConfig = {
  ...config,
  transport: "ssh",
  executablePath: "./tls_client",
  executableName: "tls_client",
  target: { host: "192.168.50.21", port: 12347 },
  managedServer: {
    ...config.managedServer,
    enabled: true,
    executablePath: "./tls_server",
    executableName: "tls_server",
  },
  ssh: {
    executablePath: "ssh",
    connectTimeoutMs: 5000,
    strictHostKeyChecking: "yes",
    knownHostsPath: null,
    indyLedger: {
      host: "192.168.50.100",
      port: 9702,
      genesisPath: "/root/openhitls-main/testcode/demo-did/pool_transactions_genesis",
    },
    server: {
      label: "板卡21",
      host: "192.168.50.21",
      port: 22,
      user: "root",
      identityPath: null,
      workingDirectory: "/root/openhitls-main/testcode/demo-did/build",
      executablePath: "./tls_server",
      didCertificatePath: "./certs/server_indy_cert.der",
      didKeyPath: "./certs/server_indy_key.der",
      libraryPath: "/root/openhitls-main/build:/root/indy-vdr/target/release",
    },
    client: {
      label: "板卡22",
      host: "192.168.50.22",
      port: 22,
      user: "root",
      identityPath: null,
      workingDirectory: "/root/openhitls-main/testcode/demo-did/build",
      executablePath: "./tls_client",
      didCertificatePath: "../client_did_cert.der",
      didKeyPath: "../client_did_key.der",
      libraryPath: "/root/openhitls-main/build:/root/indy-vdr/target/release",
    },
  },
};

test("maps the latest hardware DID command-line contract", () => {
  assert.deepEqual(buildHardwareServerArgs(hardwareConfig, request({ authMode: "did" })), [
    "--did",
    "--server-cert",
    "./certs/server_indy_cert.der",
    "--server-key",
    "./certs/server_indy_key.der",
  ]);
  assert.deepEqual(
    buildHardwareClientArgs(hardwareConfig, request({ authMode: "did", mutualTls: true })),
    [
      "--did",
      "--mtls",
      "--client-cert",
      "../client_did_cert.der",
      "--client-key",
      "../client_did_key.der",
    ],
  );
});

test("does not misrepresent the hardware fallback flag as Auto", () => {
  assert.throws(
    () => buildHardwareClientArgs(hardwareConfig, request({ authMode: "auto" })),
    (error) => error instanceof GatewayError && error.code === "AUTH_MODE_UNSUPPORTED",
  );
});
