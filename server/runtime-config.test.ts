import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig, toPublicRuntimeInfo } from "./runtime-config.js";

test("loads the latest two-board SSH defaults without treating remote paths as local files", () => {
  const config = loadRuntimeConfig({ HITLS_TRANSPORT: "ssh" }, process.cwd());
  assert.equal(config.status, "ready");
  assert.equal(config.target.host, "192.168.50.21");
  assert.equal(config.target.port, 12347);
  assert.equal(config.ssh?.client.executablePath, "./tls_client");
  assert.equal(config.ssh?.server.executablePath, "./tls_server");

  const runtime = toPublicRuntimeInfo(config, new Date(0), new Date(1000));
  assert.equal(runtime.backend.adapter, "openhitls-hardware-ssh");
  assert.equal(runtime.backend.capabilities.autoMode, false);
  assert.equal(runtime.backend.server.mode, "ssh-managed");
});
