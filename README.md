# DataTrust Connector UI（真实后端版）

这是 `openHiTLS + Indy DID` 的本地运维前端。活动页面已移除 Mock 业务流程，浏览器通过 Connector Gateway 调用仓库中的 `unified_tls_client`，并展示真实进程产生的握手结果、HITLS 错误码、`DID_VerifyResult` 和原生日志。

完整的安装、配置、页面操作和排障说明见 [`docs/frontend-usage-guide.zh-CN.md`](docs/frontend-usage-guide.zh-CN.md)。

如果原生客户端未编译或未配置，页面会显示 `unconfigured` 并禁止执行，不会伪造成功结果。

## 架构

```text
React / Vite (:5173)
        │  /api
        ▼
Connector Gateway (:8787)
        │  spawn(shell=false)
        ▼
unified_tls_client --auth-mode traditional|did|auto [--mtls|--cert ... --key ...]
        │
        ▼
openHiTLS handshake + Indy VDR GET_NYM
```

Gateway 是必要的：浏览器不能直接调用 C 可执行文件。它还负责固定可执行路径、限制请求体和日志大小、处理超时，并把原生文本输出转换为稳定 JSON。

## 已接入的真实数据

- Gateway 和原生客户端的独立运行状态；
- Traditional TLS、DID-TLS、Auto 三种原生认证参数；
- 可选 mTLS；DID/Auto 开启 mTLS 时使用配置的 DID 客户端证书；
- 实际进程退出码、信号、总耗时和原生握手耗时；
- HITLS 十六进制错误码和可识别的 TLS Alert；
- `DID_VerifyResult` 0–7：成功、证书解析失败、DID 未找到、链上查询失败、公钥不匹配、有效期失败、签名失败、内部错误；
- NORMAL / DID / UNKNOWN 证书模式。原生客户端没有输出的对端信息保持 `UNKNOWN`，前端不会推测；
- 当前 Gateway 进程内最多 50 条真实握手历史和完整 stdout/stderr。

## 环境要求

- Node.js 18 或更高版本；
- 已构建的 `unified_tls_client`；
- 运行 DID 模式时，原生程序所需的 Indy VDR 库和网络配置必须可用；
- `127.0.0.1:12346` 上需运行与客户端匹配的 `unified_tls_server`。这是当前 C 示例中的编译期固定目标。

## 配置

复制示例文件：

```powershell
Copy-Item .env.example .env
```

至少设置：

```dotenv
HITLS_CLIENT_BIN=/absolute/path/to/unified_tls_client
HITLS_CLIENT_WORKDIR=/absolute/path/to/openhitls-main/testcode/demo-did
```

需要 DID 双向认证时再设置：

```dotenv
HITLS_DID_CERT=/absolute/path/to/client_did_cert.der
HITLS_DID_KEY=/absolute/path/to/client_did_key.der
```

仅验证服务器 DID 时不需要客户端证书。Windows 上若原生程序运行在 WSL，推荐把 `HITLS_CLIENT_BIN` 指向一个 Windows 可执行包装器，并通过 `HITLS_CLIENT_PREFIX_ARGS`（JSON 字符串数组）传递包装器的固定前置参数。

## 启动

```powershell
npm install
npm run dev
```

- Web：`http://127.0.0.1:5173`
- Gateway：`http://127.0.0.1:8787`

Vite 会把 `/api` 代理到 Gateway。生产环境可以用 `VITE_GATEWAY_TARGET` 修改代理目标。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | Gateway 与原生后端简要状态 |
| `GET` | `/api/runtime` | 可公开的运行配置和能力 |
| `GET` | `/api/handshakes` | 当前进程内的真实执行历史 |
| `POST` | `/api/handshakes` | 启动一次原生握手 |

请求示例：

```json
{
  "authMode": "did",
  "mutualTls": false,
  "timeoutMs": 15000
}
```

为避开当前 Indy 集成的线程安全风险，Gateway 同一时间只允许一个握手任务；并发请求返回 `409 HANDSHAKE_BUSY`。

## 验证

```powershell
npm run test
npm run build
npm run check
```

测试覆盖原生成功/失败/超时输出解析、Traditional 参数、单向 DID 参数，以及 DID mTLS 证书配置校验。

## 主要目录

```text
server/                         Connector Gateway 与原生进程适配
shared/runtime-contract.ts      前后端共用 API 类型
src/modules/runtime/            运行状态、握手和历史页面
src/shared/services/            HTTP API 客户端
```

旧版 `src/shared/data/mock.ts` 和演示组件仍保留作为历史参考，但不再被活动应用入口导入，也不会影响任何运行结果。
