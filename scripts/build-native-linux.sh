#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UI_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HITLS_ROOT="${HITLS_ROOT:-$(cd "${UI_ROOT}/../openhitls-main" && pwd)}"
DEMO_ROOT="${HITLS_ROOT}/testcode/demo-did"
HITLS_BUILD="${HITLS_ROOT}/build"
DEMO_BUILD="${DEMO_ROOT}/build"

command -v cmake >/dev/null 2>&1 || {
  echo "[error] cmake is required. Install cmake, gcc/g++, make and python3 first." >&2
  exit 1
}

if [[ ! -f "${HITLS_ROOT}/CMakeLists.txt" || ! -f "${DEMO_ROOT}/CMakeLists.txt" ]]; then
  echo "[error] openHiTLS source was not found at ${HITLS_ROOT}" >&2
  exit 1
fi

cmake_args=()
if [[ -n "${INDY_VDR_ROOT:-}" ]]; then
  cmake_args+=("-DINDY_VDR_ROOT=${INDY_VDR_ROOT}")
else
  echo "[warning] INDY_VDR_ROOT is not set. Traditional TLS can be built, but DID/Auto ledger verification will remain unavailable." >&2
fi

cmake -S "${HITLS_ROOT}" -B "${HITLS_BUILD}" "${cmake_args[@]}"
cmake --build "${HITLS_BUILD}" --parallel
cmake -S "${DEMO_ROOT}" -B "${DEMO_BUILD}" "${cmake_args[@]}"
cmake --build "${DEMO_BUILD}" --target unified_tls_client unified_tls_server --parallel

CLIENT_BIN="${DEMO_BUILD}/unified_tls_client"
SERVER_BIN="${DEMO_BUILD}/unified_tls_server"
if [[ ! -x "${CLIENT_BIN}" || ! -x "${SERVER_BIN}" ]]; then
  echo "[error] Native build completed without the expected unified binaries." >&2
  exit 1
fi

ENV_FILE="${UI_ROOT}/.env"
if [[ ! -e "${ENV_FILE}" ]]; then
  cat > "${ENV_FILE}" <<EOF
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=8787
HITLS_CLIENT_BIN=${CLIENT_BIN}
HITLS_CLIENT_WORKDIR=${DEMO_ROOT}
HITLS_CLIENT_PREFIX_ARGS=[]
HITLS_FIXED_HOST=127.0.0.1
HITLS_FIXED_PORT=12346
HITLS_MANAGE_SERVER=true
HITLS_SERVER_BIN=${SERVER_BIN}
HITLS_SERVER_WORKDIR=${DEMO_ROOT}
HITLS_SERVER_STARTUP_TIMEOUT_MS=3000
HITLS_DID_CERT=${DEMO_ROOT}/client_did_cert.der
HITLS_DID_KEY=${DEMO_ROOT}/client_did_key.der
HITLS_SERVER_DID_CERT=${DEMO_ROOT}/server_did_cert.der
HITLS_SERVER_DID_KEY=${DEMO_ROOT}/server_did_key.der
INDY_GENESIS_PATH=${INDY_GENESIS_PATH:-}
EOF
  echo "[ok] Created ${ENV_FILE}"
else
  echo "[warning] ${ENV_FILE} already exists; it was not overwritten. Update its native paths if needed." >&2
fi

echo "[ok] Native client: ${CLIENT_BIN}"
echo "[ok] Native server: ${SERVER_BIN}"
echo "[next] cd ${UI_ROOT} && npm run dev"
