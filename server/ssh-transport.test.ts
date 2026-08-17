import assert from "node:assert/strict";
import test from "node:test";
import type { SshNodeConfig, SshTransportConfig } from "./runtime-config.js";
import {
  buildRemoteProgramCommand,
  buildSshArgs,
  quotePosixShell,
} from "./ssh-transport.js";

const node: SshNodeConfig = {
  label: "板卡22",
  host: "192.168.50.22",
  port: 22,
  user: "root",
  identityPath: "C:\\keys\\board key",
  workingDirectory: "/root/openhitls-main/testcode/demo-did/build",
  executablePath: "./tls_client",
  didCertificatePath: "../client_did_cert.der",
  didKeyPath: "../client_did_key.der",
  libraryPath: "/root/openhitls-main/build:/root/indy-vdr/target/release",
};

const transport: SshTransportConfig = {
  executablePath: "ssh",
  connectTimeoutMs: 5000,
  strictHostKeyChecking: "yes",
  knownHostsPath: null,
  server: node,
  client: node,
  indyLedger: { host: "192.168.50.100", port: 9702, genesisPath: "/tmp/genesis" },
};

test("quotes every remote program argument for the POSIX shell", () => {
  assert.equal(quotePosixShell("a'b"), `'a'"'"'b'`);
  const command = buildRemoteProgramCommand(node, ["--client-cert", "file name.der"]);
  assert.match(command, /'\.\/tls_client' '--client-cert' 'file name\.der'/u);
  assert.match(command, /'LD_LIBRARY_PATH=\/root\/openhitls-main\/build:/u);
});

test("builds a non-interactive host-key-checking SSH invocation", () => {
  const args = buildSshArgs(transport, node, "printf 'READY'");
  assert.ok(args.includes("BatchMode=yes"));
  assert.ok(args.includes("StrictHostKeyChecking=yes"));
  assert.deepEqual(args.slice(-3), ["--", "root@192.168.50.22", "printf 'READY'"]);
});
