# TrustGate-DID 前端使用指南

> 适用版本：双板卡真实 DID-TLS 认证 + Gateway 可信数据流通 + 可选真实 Fabric 审计

## 1. 系统组成与真实性边界

系统由浏览器前端、控制电脑上的 Connector Gateway、两块硬件板卡以及 Indy VDR 组成。

```text
浏览器
  ↓ HTTP
Connector Gateway（控制电脑）
  ├─ SSH → 板卡21：openHiTLS 服务端
  ├─ SSH → 板卡22：openHiTLS 客户端
  ├─ 数据产品目录、数字合约与字段策略
  └─ Fabric Gateway → 审计链码（启用时）

两块板卡 → Indy VDR：GET_NYM 身份查询
```

当前版本的真实程度如下：

| 功能 | 当前状态 |
| --- | --- |
| DID-TLS、DID-mTLS 与双轨兼容认证 | 两块板卡真实执行 |
| GET_NYM、证书公钥与链上 VerKey 校验 | 板端真实执行 |
| 异常身份冒用、未注册 DID 阻断 | 板端固定实验配置真实执行 |
| traceId、数字合约和 contractHash | Gateway 实际生成 |
| 字段 plain/mask/encrypt/deny | Gateway 实际执行 |
| controlledData 和 deliveryHash | Gateway 实际生成 |
| 可信流通记录 | Gateway 内存保留最近 100 条 |
| Fabric 交易提交和链上查询 | 配置身份后通过 Fabric Gateway 真实执行；未配置时明确显示 disabled/unavailable |
| 订单风控业务数据 | Gateway 内置实验数据，不是外部生产数据库 |
| LRU 命中、连接池复用、会话恢复指标 | 板端尚未对 Gateway 暴露，页面显示 `NOT EXPOSED` |

页面不会用固定数字冒充板端性能，也只有在 Fabric 返回有效交易 ID 与区块号后才显示已上链。

## 2. 启动前检查

启动前应保证：

- 控制电脑已连接两块板卡所在的受信任网络；
- Gateway 使用的 SSH 凭据能够非交互登录两块板卡；
- 板端 `tls_server`、`tls_client`、证书、Genesis 和动态库存在；
- Indy VDR 验证节点可访问；
- 项目根目录中的 `.env` 已完成配置；
- Node.js 版本满足项目 `package.json` 的要求。

建议先执行：

```powershell
ssh -o BatchMode=yes root@板卡21 "printf READY"
ssh -o BatchMode=yes root@板卡22 "printf READY"
```

两条命令都应直接输出 `READY`，不能在 Gateway 执行过程中再等待输入密码。

## 3. 启动前端和 Gateway

在 PowerShell 中进入项目目录：

```powershell
Set-Location E:\front\datatrust-connector-ui-main
```

开发模式：

```powershell
npm.cmd run dev
```

如果 `npm` 报“系统禁止运行脚本”或 `npm.ps1` 无法加载，请继续使用 `npm.cmd`，不要修改系统全局执行策略。

启动成功后终端会显示：

```text
[gateway] http://0.0.0.0:8787
[web] Local: http://localhost:5173/
```

浏览器访问：

```text
http://localhost:5173
```

开发终端需要保持运行。终端停掉后，页面虽然可能仍然打开，但无法再调用 Gateway。

生产演示模式：

```powershell
npm.cmd run build
npm.cmd start
```

生产模式由 Gateway 直接托管构建后的前端，浏览器访问：

```text
http://localhost:8787
```

### 3.1 可选 Fabric 审计配置

普通启动不会自动启动 Fabric Orderer、Peer 或链码进程。当外部 Fabric 网络已就绪时，在 `.env` 中配置：

```dotenv
FABRIC_AUDIT_ENABLED=true
FABRIC_PEER_ENDPOINT=192.168.50.21:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.datatrust.local
FABRIC_MSP_ID=Org1MSP
FABRIC_CHANNEL=datatrustchannel
FABRIC_CHAINCODE=datatrust-audit
FABRIC_TLS_ROOT_CERT=C:\absolute\path\to\ca.crt
FABRIC_IDENTITY_CERT=C:\absolute\path\to\signcert.pem
FABRIC_IDENTITY_KEY=C:\absolute\path\to\private_key
```

Fabric TLS 证书和 MSP 身份文件必须由运行环境提供，不包含在 GitHub 源码包中。未启用 Fabric 时保持 `FABRIC_AUDIT_ENABLED=false`，DID-TLS 硬件认证仍可独立使用。

## 4. 左侧导航说明

当前前端包含五个工作区：

1. 运行状态
2. 身份认证与互信验证
3. 可信数据流通
4. 审计追溯
5. 认证日志

### 顶部状态标签

- `Gateway online`：浏览器已连接控制电脑上的 Gateway；
- `Native ready`：原生认证后端配置完整；
- `Hardware ready`：两块板卡及 Indy 预检通过；
- `Fabric connected`：Fabric Peer、通道与审计链码可查询；
- `Fabric disabled/unavailable`：尚未启用，或身份、Peer、通道、链码配置不可用。

## 5. 运行状态

“运行状态”用于在执行认证前检查环境。

主要检查：

- Gateway 是否在线；
- 两块板卡 SSH 是否可达；
- 远程工作目录和二进制是否存在；
- DID 证书和私钥配置是否完整；
- Indy Genesis 与动态库是否存在；
- Indy 节点端口是否可达。

状态含义：

| 状态 | 含义 |
| --- | --- |
| `ready` | 当前预检通过 |
| `unreachable` | 网络、SSH、主机指纹或认证失败 |
| `misconfigured` | 远程路径、程序、证书、Genesis 或动态库缺失 |
| `checking` | Gateway 正在执行预检 |

端口预检通过不等于 DID 认证已经成功。DID 是否完成链上验证，仍以实际握手中的 GET_NYM 和 DID_VerifyResult 为准。

## 6. 身份认证与互信验证

页面提供六个固定场景：

| 编号 | 场景 | 预期结果 |
| --- | --- | --- |
| N1 | DID-TLS 单向认证 | 客户端验证服务端 DID，连接成功 |
| N2 | DID-mTLS 双向认证 | 双方 DID 均通过链上校验，连接成功 |
| N3 | 传统 Client → DID Server | 识别传统节点并进入 PKI 兼容轨 |
| N4 | DID Client → 传统 Server | DID 轨不可用时按固定策略进入 PKI 轨 |
| A1 | DID 身份冒用 | 证书公钥与链上 VerKey 不匹配，连接被阻断 |
| A2 | 未注册 DID | GET_NYM 未找到有效 NYM，连接被阻断 |

### 执行步骤

1. 打开“身份认证与互信验证”；
2. 在正常认证、双轨兼容或异常拦截分组中选择场景；
3. 确认页面显示“可执行”；
4. 根据需要调整认证执行超时；
5. 点击执行按钮；
6. 等待板卡服务端启动、客户端握手和日志回收完成；
7. 查看右侧结果、证据步骤、错误码和原生日志。

一次执行期间按钮会禁用。Gateway 为保护当前 Indy 集成，同一时间只允许运行一条原生握手任务。

### 正常场景判定

N1 成功时重点查看：

- DID-TLS 握手耗时；
- GET_NYM 查询证据；
- 证书公钥与 Ledger VerKey 一致；
- 身份状态为 `TRUSTED`；
- TLS 通道建立成功。

N2 成功时重点查看：

- Client 与 Server 两侧均完成 DID 查询；
- 双向证书交换成功；
- 双向公钥绑定一致；
- DID-mTLS 安全通道建立。

### 兼容场景判定

N3/N4 应明确显示：

- 对端能力识别；
- DID/PKI 双轨策略判定；
- `FALLBACK → PKI`；
- PKI 证书认证结果；
- 最终通道状态。

### 异常场景判定

A1/A2 的成功不是 TLS 连接成功，而是攻击被正确阻断。

- A1：重点查看 `PUBLIC_KEY_MISMATCH` 或对应 DID_VerifyResult；
- A2：重点查看 GET_NYM 返回空身份以及 `DID_NOT_FOUND`；
- 最终状态应为 `BLOCKED`；
- 页面应显示失败阶段，且不会生成业务数据交付结果。

## 7. 可信数据流通

该页面把硬件身份认证与 Gateway 业务逻辑串成一条完整链路：

```text
DID-mTLS 硬件认证
→ 身份性能证据
→ 数据产品目录
→ 数字合约与策略绑定
→ 字段策略执行
→ 受控数据交付
→ Fabric 双组织背书与审计摘要提交
```

### 7.1 正常受控交付

1. 打开“可信数据流通”；
2. 选择“正常受控交付”；
3. 选择使用目的；
4. 选择字段策略版本 `v1` 或 `v2`；
5. 点击“执行真实可信数据流通”；
6. 等待硬件 DID-mTLS 和 Gateway 业务处理完成。

执行成功后应看到：

- 自动生成的 `traceId`；
- 硬件握手记录 ID；
- DID_VerifyResult 为成功；
- Gateway 生成的数字合约；
- 完整的 64 位 SHA-256 `contractHash`；
- 每个字段的实际处理动作；
- 受控交付结果 `controlledData`；
- 实际计算的 `deliveryHash`；
- Fabric 交易 ID 与区块号；
- `fabricCommitted` 为 `true`。

如果 Fabric 未连接，Gateway 会返回 `FABRIC_COMMIT_FAILED`，不会把业务处理结果冒充为已完成上链。

字段动作：

| 动作 | 结果 |
| --- | --- |
| `PLAIN` | 满足条件的字段明文交付 |
| `MASK` | 脱敏后交付 |
| `ENCRYPT` | 生成字段密文表示后交付 |
| `DENY` | 不交付原字段值 |

### 7.2 越权访问阻断

1. 选择“越权访问阻断”；
2. 点击执行按钮；
3. 系统仍会先完成真实 DID-mTLS；
4. 身份可信后进入合约和策略判断；
5. Gateway 模拟高敏感字段明文越权请求；
6. 策略引擎阻断请求，不生成 `controlledData` 和 `deliveryHash`；
7. 生成 `ViolationDetected` 审计事件。

身份可信不代表自动拥有全部字段访问权。越权场景用于证明“可信接入”和“业务授权”是两个独立判定阶段。

### 7.3 性能证据说明

- DID-TLS 握手耗时来自板端原生输出；
- GET_NYM 耗时只有板端日志明确提供时才显示；
- LRU、连接池和会话恢复没有输出证据时显示 `NOT EXPOSED`；
- 页面不会继续显示固定的 60.7 ms、0.8 ms 等演示值。

### 7.4 认证失败时

如果硬件 DID-mTLS 失败：

- 状态显示 `AUTHENTICATION_FAILED`；
- 数字合约不激活；
- 字段策略不执行；
- 数据不交付；
- 审计中只记录连接器上下文和身份验证失败事件。

## 8. 审计追溯

“审计追溯”读取 Gateway 实际产生的可信流通记录。

### 8.1 查询与筛选

- 输入完整 `traceId` 后点击“查询证据链”；
- 可筛选正常交付、违规阻断；
- 可按八类事件查看时间线：
  - `ConnectorRegistered`
  - `IdentityVerified`
  - `ProductPublished`
  - `DataAccessRequested`
  - `ContractActivated`
  - `PolicyUpdated`
  - `DataDelivered`
  - `ViolationDetected`

并非每条记录都会包含全部事件。例如身份认证失败时不会产生合约激活和数据交付事件，正常交付也不会产生违规事件。

### 8.2 Fabric 审计回执

当前回执包含：

- `receiptId`
- `transactionId`
- `blockNumber`
- `traceId`
- 完成时间
- 事件摘要
- `contractHash`
- `deliveryHash`

摘要由 Gateway 生成，由 Fabric SDK 提交到审计链码。只有收到成功提交状态后页面才显示：

```text
Backend: fabric
Fabric Commit: TRUE
```

### 8.3 摘要检查

“核验本次 Gateway 摘要字段”用于检查当前记录是否具有合约摘要、末端事件摘要以及交付摘要。

摘要检查会结合 Fabric 交易回执与链码查询结果；无有效交易回执时不能声称已完成链上存证。

### 8.4 数据边界

审计记录包含事件类型、DID、合约哈希、策略版本、交付哈希、时间戳和 traceId，不应包含身份证号、手机号、支付账户、原始数据集或解密密钥。

## 9. 认证日志

“认证日志”保存当前 Gateway 进程中执行过的硬件握手。

用途：

- 查看成功、失败和超时记录；
- 回到对应认证结果页；
- 查看 DID_VerifyResult；
- 查看客户端、服务端和 Gateway 原生日志；
- 排查 HITLS 错误码、TLS Alert 和退出码。

可信数据流通自动触发的 DID-mTLS 也会写入认证日志。

## 10. 数据保存周期

当前以下数据保存在 Gateway 内存中：

- 最近最多 50 条硬件认证日志；
- 最近最多 100 条可信流通与审计记录。

重启 Gateway 后内存列表会清空，但已成功提交的 Fabric 审计摘要仍保留在账本中，可使用 traceId 通过链码查询。

## 11. 常见问题

### 11.1 PowerShell 禁止运行 npm.ps1

使用：

```powershell
npm.cmd run dev
```

无需为运行本项目修改全局 PowerShell 执行策略。

### 11.2 页面一直显示 Gateway offline

检查开发终端是否仍在运行，并访问：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

正常应返回 `status: ok`。

### 11.3 SSH Permission denied

Gateway 使用非交互 SSH。请检查专用私钥、ssh-agent、板端 `authorized_keys` 和 `known_hosts`，不要把板卡密码写进前端代码。

### 11.4 握手按钮长时间没有结果

一次真实执行需要启动服务端、等待监听、运行客户端、完成 Indy 查询并回收日志，通常比普通页面操作慢。超过设定超时后 Gateway 会返回超时结果。

### 11.5 TLS 成功但 DID 显示失败

重点检查原生日志中是否存在 GET_NYM 成功证据，以及 Genesis、Indy 动态库、链上 DID 和证书公钥是否一致。前端不会仅凭 TLS 建连就宣称 DID 身份可信。

### 11.6 审计页面没有记录

先在“可信数据流通”执行一条链路。认证页面的独立 N1/N2 执行只进入认证日志，不会自动生成数字合约和可信流通审计记录。

### 11.7 刷新后样式没有变化

开发模式通常会自动热更新。如果仍显示旧资源，使用 `Ctrl + F5` 强制刷新；生产模式修改代码后需要重新执行 `npm.cmd run build` 并重启 Gateway。

## 12. 验证命令

完整测试和生产构建：

```powershell
npm.cmd run check
```

查看 Gateway 状态：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
Invoke-RestMethod http://127.0.0.1:8787/api/runtime
Invoke-RestMethod http://127.0.0.1:8787/api/preflight
```

查看数据产品和审计记录：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/trusted-flow/products
Invoke-RestMethod http://127.0.0.1:8787/api/trusted-flow/traces
```

## 13. 安全注意事项

- 不要把 SSH 密码、私钥内容或 `.env` 提交到仓库；
- 浏览器不能自行指定 SSH 命令、远程路径和证书路径；
- Gateway、板卡 SSH 和 Indy 端口不要直接暴露到公网；
- 远程演示应使用受信任局域网、VPN 或安全隧道；
- Fabric 未返回有效 transactionId 和 blockNumber 前，不得宣称已完成真实上链；
- Fabric MSP 身份私钥、SSH 私钥、运行时二进制和账本数据不得提交到公开仓库。
