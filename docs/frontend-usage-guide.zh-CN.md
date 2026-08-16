# DataTrust Connector 前端使用指南

## 1. 前端用途

本前端用于操作和观察 `openHiTLS + Indy DID` 的真实握手流程。

调用链如下：

```text
浏览器
  → Connector Gateway
  → unified_tls_client
  → openHiTLS TLS/DID-TLS 握手
  → Indy VDR 链上 DID 验证
```

页面不会在浏览器中模拟握手。原生客户端未配置时，系统会显示 `unconfigured` 并禁止执行，不会产生虚假的成功记录。

## 2. 使用前准备

需要准备：

1. Node.js 18 或更高版本；
2. 已编译的 `unified_tls_client`；
3. 正在监听 `127.0.0.1:12346` 的 `unified_tls_server`；
4. 使用 DID 模式时，原生程序所需的 Indy VDR 动态库、网络配置和账本连接必须可用；
5. 使用 DID 双向认证时，需要客户端 DID 证书和私钥。

检查 Node.js：

```powershell
node -v
npm -v
```

## 3. 安装前端

进入项目目录：

```powershell
cd F:\openhitls-main-share\datatrust-connector-ui-real
```

安装依赖：

```powershell
npm install
```

复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

## 4. 配置原生后端

编辑项目根目录下的 `.env`。

### 4.1 最小配置

```dotenv
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=8787

HITLS_CLIENT_BIN=/absolute/path/to/unified_tls_client
HITLS_CLIENT_WORKDIR=/absolute/path/to/openhitls-main/testcode/demo-did

HITLS_FIXED_HOST=127.0.0.1
HITLS_FIXED_PORT=12346
```

配置项说明：

| 配置项 | 是否必需 | 用途 |
| --- | --- | --- |
| `GATEWAY_HOST` | 否 | Gateway 监听地址，默认 `127.0.0.1` |
| `GATEWAY_PORT` | 否 | Gateway 端口，默认 `8787` |
| `HITLS_CLIENT_BIN` | 是 | `unified_tls_client` 的绝对路径 |
| `HITLS_CLIENT_WORKDIR` | 建议 | 原生进程工作目录 |
| `HITLS_CLIENT_PREFIX_ARGS` | 否 | 固定前置参数，格式必须为 JSON 字符串数组 |
| `HITLS_FIXED_HOST` | 否 | 页面显示的原生客户端固定目标地址 |
| `HITLS_FIXED_PORT` | 否 | 页面显示的原生客户端固定目标端口 |

当前 `unified_tls_client.c` 将目标地址和端口编译为 `127.0.0.1:12346`。`HITLS_FIXED_HOST/PORT` 只用于让页面显示值与该二进制文件保持一致，不能动态修改 C 程序的连接目标。

### 4.2 DID 双向认证配置

只有在 DID 或 Auto 模式中开启“双向认证”时，才需要以下配置：

```dotenv
HITLS_DID_CERT=/absolute/path/to/client_did_cert.der
HITLS_DID_KEY=/absolute/path/to/client_did_key.der
```

关闭双向认证时，DID 模式仍会验证服务器证书中的 Indy DID，不需要客户端证书。

### 4.3 Windows 路径示例

如果使用 Windows 原生可执行文件，可以写为：

```dotenv
HITLS_CLIENT_BIN=F:\openhitls-main-share\openhitls-main\testcode\demo-did\unified_tls_client.exe
HITLS_CLIENT_WORKDIR=F:\openhitls-main-share\openhitls-main\testcode\demo-did
HITLS_DID_CERT=F:\openhitls-main-share\openhitls-main\testcode\demo-did\client_did_cert.der
HITLS_DID_KEY=F:\openhitls-main-share\openhitls-main\testcode\demo-did\client_did_key.der
```

如果原生程序运行在 WSL/Linux 中，建议 Gateway 和原生程序运行在同一个 Linux 文件系统环境，避免 Windows 与 Linux 证书路径格式不一致。

## 5. 启动系统

### 5.1 启动原生服务器

先在 openHiTLS 的运行环境中启动与测试场景匹配的 `unified_tls_server`。

传统 TLS 示例：

```bash
cd /path/to/openhitls-main/testcode/demo-did
./unified_tls_server --auth-mode traditional
```

DID-TLS 示例：

```bash
./unified_tls_server \
  --auth-mode did \
  --cert ./server_did_cert.der \
  --key ./server_did_key.der
```

Auto 示例：

```bash
./unified_tls_server \
  --auth-mode auto \
  --cert ./server_did_cert.der \
  --key ./server_did_key.der
```

服务器的实际参数以当前 C 程序的 `--help` 输出为准：

```bash
./unified_tls_server --help
```

当前示例服务器每次启动只接受一次客户端连接。再次执行前端握手前，需要重新启动服务器。

### 5.2 启动前端和 Gateway

```powershell
cd F:\openhitls-main-share\datatrust-connector-ui-real
npm run dev
```

正常情况下会启动：

- 前端：`http://127.0.0.1:5173`
- Gateway：`http://127.0.0.1:8787`

在浏览器中打开前端地址即可。

如果 `5173` 已被占用，Vite 会自动选择其他端口，以终端输出为准。Gateway 默认固定使用 `8787`；该端口被占用时需要先停止重复进程，或者同时修改 `.env` 与 Vite 的 Gateway 目标配置。

## 6. 页面使用方法

### 6.1 运行状态

“运行状态”页面分开显示两个组件：

- `Connector Gateway`：浏览器能够访问本地 HTTP API；
- `openHiTLS 原生后端`：Gateway 能够找到配置的原生客户端。

原生后端状态含义：

| 状态 | 含义 |
| --- | --- |
| `ready` | 原生客户端路径有效，可以发起握手 |
| `unconfigured` | 没有配置 `HITLS_CLIENT_BIN` |
| `unavailable` | 路径不存在、不是文件或工作目录不可用 |

页面还会显示：

- 固定连接目标；
- 使用的适配器；
- DID 客户端证书是否就绪；
- Gateway 版本、启动时间和运行时长。

### 6.2 真实握手

进入“真实握手”页面后选择认证模式。

#### Traditional TLS

只执行传统 PKI/TLS 验证。

- 关闭双向认证：`unified_tls_client --auth-mode traditional`
- 开启双向认证：额外传入 `--mtls`

#### DID-TLS

执行服务器证书中的 Indy DID 解析、链上查询和公钥匹配。

- 关闭双向认证：验证服务器 DID，不发送客户端证书；
- 开启双向认证：额外传入配置的 `--cert` 和 `--key`，双方进行证书认证。

#### Auto

使用 openHiTLS 扩展协商认证模式。当前原生代码在 Auto 模式中启用 DID 优先和传统 TLS 回退。

#### 超时时间

允许范围为 `1000` 到 `120000` 毫秒，默认 `15000` 毫秒。超过时间后 Gateway 会终止原生进程，结果显示为 `timed_out`。

确认配置后点击“执行 openHiTLS 握手”。

为保护当前 Indy 集成的线程安全，Gateway 同一时间只执行一个握手。重复提交会返回 `HANDSHAKE_BUSY`。

### 6.3 握手结果

结果区包含：

| 字段 | 含义 |
| --- | --- |
| `status` | `succeeded`、`failed` 或 `timed_out` |
| 原生握手耗时 | C 客户端输出的“握手完成，用时” |
| Gateway 总耗时 | 从启动进程到进程结束的时间 |
| HITLS 错误码 | 原生握手失败时输出的十六进制错误码 |
| TLS Alert | 日志中可识别的 TLS Alert 名称 |
| 进程退出码 | `unified_tls_client` 的真实退出码 |
| 本地证书模式 | `NORMAL`、`DID` 或 `UNKNOWN` |
| 对端证书模式 | 原生端未输出时保持 `UNKNOWN` |
| DID 验证 | 状态、数字错误码、枚举名和中文说明 |
| 原生日志 | stdout/stderr 的完整逐行记录 |

`UNKNOWN` 表示当前原生客户端没有输出足够信息，并不自动表示握手失败。

### 6.4 结果历史

“结果历史”最多保存当前 Gateway 进程中的 50 条真实执行记录。

点击任意历史记录会返回握手页面并打开该记录的详细结果。Gateway 重启后，内存历史会清空。

## 7. DID 验证结果对照

| 数字码 | 枚举名 | 含义 |
| ---: | --- | --- |
| `0` | `DID_VERIFY_SUCCESS` | DID 验证成功 |
| `1` | `DID_VERIFY_CERT_PARSE_FAIL` | 证书解析失败 |
| `2` | `DID_VERIFY_DID_NOT_FOUND` | 证书 SAN 中未找到 DID |
| `3` | `DID_VERIFY_BLOCKCHAIN_FAIL` | Indy 链上查询或验证失败 |
| `4` | `DID_VERIFY_PUBKEY_MISMATCH` | 证书公钥与 DID Document 公钥不一致 |
| `5` | `DID_VERIFY_CERT_TIME_FAIL` | 证书有效期校验失败 |
| `6` | `DID_VERIFY_SIGNATURE_FAIL` | 签名验证失败 |
| `7` | `DID_VERIFY_INTERNAL_ERROR` | DID 模块内部错误 |

## 8. 常见错误与处理

### Gateway offline

表现：页面显示 Gateway offline 或无法加载运行状态。

处理：

1. 确认 `npm run dev` 仍在运行；
2. 检查终端是否出现端口占用；
3. 访问 `http://127.0.0.1:8787/api/health`；
4. 确认 Vite 代理目标和 Gateway 端口一致。

### `BACKEND_NOT_READY`

原因：没有配置原生客户端，或者配置路径无效。

处理：检查 `.env` 中的 `HITLS_CLIENT_BIN` 和 `HITLS_CLIENT_WORKDIR`，修改后重启 Gateway。

### `DID_CERT_PROFILE_NOT_CONFIGURED`

原因：选择 DID/Auto 双向认证，但客户端证书或私钥没有配置、文件不存在。

处理：配置 `HITLS_DID_CERT` 和 `HITLS_DID_KEY`，或者关闭双向认证。

### `PROCESS_SPAWN_FAILED`

原因：操作系统无法启动配置的原生程序。

处理：检查：

- 文件是否与当前操作系统兼容；
- 是否具有执行权限；
- 动态库是否可加载；
- 工作目录是否正确；
- WSL/Linux 与 Windows 路径是否混用。

### TLS 握手失败

优先查看：

1. HITLS 错误码；
2. DID 验证枚举；
3. 原生 stderr/stdout；
4. 服务端是否监听 `127.0.0.1:12346`；
5. 客户端和服务器认证模式、证书配置是否匹配；
6. Indy VDR 是否能够连接账本并查询对应 DID。

## 9. 直接调用 Gateway API

读取运行状态：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/runtime
```

发起 DID 单向认证：

```powershell
$body = @{
  authMode = "did"
  mutualTls = $false
  timeoutMs = 15000
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/handshakes `
  -ContentType "application/json" `
  -Body $body
```

读取握手历史：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/handshakes
```

## 10. 开发与验证命令

```powershell
# 只启动 Gateway
npm run start:gateway

# 同时启动 Gateway 和前端
npm run dev

# 执行单元测试
npm run test

# 类型检查并生成生产构建
npm run build

# 测试和构建全部执行
npm run check
```

生产构建输出到 `dist/`。正式部署时需要由 Web 服务器托管 `dist/`，并把 `/api` 反向代理到 Connector Gateway。
