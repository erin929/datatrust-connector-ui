# DataTrust Connector 双板卡前端使用指南

## 1. 系统职责

这套系统包含三个不同的“后端角色”：

1. 控制电脑上的 Connector Gateway：接受浏览器请求并执行 SSH 调度；
2. 板卡21上的 `tls_server`：真实 DID-TLS 服务端；
3. `192.168.50.100` 上的 Indy Ledger：DID 链上查询依赖。

板卡22运行真实客户端 `tls_client`。浏览器本身不能执行 SSH，也不能直接运行 ARM64 二进制，因此 Gateway 必须部署在能够访问两块板卡的控制电脑上。

```text
浏览器 → 控制电脑:8787 → SSH → 板卡21 tls_server
                       └──→ SSH → 板卡22 tls_client
板卡22 ── 192.168.50.21:12345 ──→ 板卡21
板卡21 / 板卡22 ──→ Indy Ledger 192.168.50.100
```

前端代码可以在任意电脑开发；双板卡认证执行必须到连接企业路由器和板卡的控制电脑上验证。

## 2. 当前原生代码契约

本项目按用户提供的最新两个源码包对齐：

| 设备 | 工作目录 | 程序 |
| --- | --- | --- |
| 板卡21 | `/root/openhitls-main/testcode/demo-did/build` | `./tls_server` |
| 板卡22 | `/root/openhitls-main/testcode/demo-did/build` | `./tls_client` |

关键事实：

- 二进制是 ARM64 Linux ELF，保留在板卡运行，不应复制到 Windows 直接执行；
- 最新客户端和服务端二进制实际使用 `192.168.50.21:12345`；配置中的目标和端口用于页面展示、服务端就绪检测，必须与实际二进制一致；
- 两块板卡需要 `/root/openhitls-main/build` 和 `/root/indy-vdr/target/release` 中的动态库；
- Genesis 默认路径为 `/root/openhitls-main/testcode/demo-did/pool_transactions_genesis`；
- Genesis 中的验证节点位于 `192.168.50.100`，客户端端口包括 `9702/9704/9706/9708`；
- 最新 `tls_*` 没有与旧 `unified_tls_* --auth-mode auto` 等价的 Auto 协商。`--fallback` 不能直接冒充 Auto，所以硬件页面禁用 Auto。

## 3. 控制电脑准备

### 3.1 软件

- Node.js `^20.19.0` 或 `>=22.12.0`；
- Git；
- Windows OpenSSH 客户端；
- 能够访问 `192.168.50.21`、`.22`、`.100` 的网卡和路由。

检查：

```powershell
node -v
npm -v
ssh -V
Test-NetConnection 192.168.50.21 -Port 22
Test-NetConnection 192.168.50.22 -Port 22
Test-NetConnection 192.168.50.100 -Port 9702
```

### 3.2 配置非交互 SSH

Gateway 使用 `BatchMode=yes`，运行握手时不会弹出密码输入框。应使用 SSH 私钥或已加载密钥的 ssh-agent。

如果还没有专用密钥：

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\datatrust_boards
```

将 `.pub` 公钥加入两块板卡的 `/root/.ssh/authorized_keys`，然后分别手工连接一次，核对主机指纹并写入 `known_hosts`：

```powershell
ssh -i $env:USERPROFILE\.ssh\datatrust_boards root@192.168.50.21
ssh -i $env:USERPROFILE\.ssh\datatrust_boards root@192.168.50.22
```

最后确认非交互登录：

```powershell
ssh -o BatchMode=yes -i $env:USERPROFILE\.ssh\datatrust_boards root@192.168.50.21 "printf READY"
ssh -o BatchMode=yes -i $env:USERPROFILE\.ssh\datatrust_boards root@192.168.50.22 "printf READY"
```

两条命令都应直接输出 `READY`。

## 4. 安装与配置

```powershell
git clone https://github.com/erin929/datatrust-connector-ui.git
cd datatrust-connector-ui
npm install
Copy-Item .env.example .env
```

编辑 `.env`。典型控制电脑配置如下：

```dotenv
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=8787
HITLS_TRANSPORT=ssh
HITLS_SSH_BIN=C:\Windows\System32\OpenSSH\ssh.exe
HITLS_SSH_STRICT_HOST_KEY_CHECKING=yes

HITLS_SERVER_SSH_HOST=192.168.50.21
HITLS_SERVER_SSH_USER=root
HITLS_SERVER_SSH_IDENTITY=C:\Users\你的用户名\.ssh\datatrust_boards
HITLS_SERVER_WORKDIR=/root/openhitls-main/testcode/demo-did/build
HITLS_SERVER_BIN=./tls_server
HITLS_SERVER_DID_CERT=./certs/server_indy_cert.der
HITLS_SERVER_DID_KEY=./certs/server_indy_key.der

HITLS_CLIENT_SSH_HOST=192.168.50.22
HITLS_CLIENT_SSH_USER=root
HITLS_CLIENT_SSH_IDENTITY=C:\Users\你的用户名\.ssh\datatrust_boards
HITLS_CLIENT_WORKDIR=/root/openhitls-main/testcode/demo-did/build
HITLS_CLIENT_BIN=./tls_client
HITLS_DID_CERT=../client_did_cert.der
HITLS_DID_KEY=../client_did_key.der

HITLS_REMOTE_LIBRARY_PATH=/root/openhitls-main/build:/root/indy-vdr/target/release
HITLS_TLS_TARGET=192.168.50.21
HITLS_TLS_PORT=12345
HITLS_INDY_HOST=192.168.50.100
HITLS_INDY_PORT=9702
HITLS_REMOTE_GENESIS_PATH=/root/openhitls-main/testcode/demo-did/pool_transactions_genesis
```

私钥路径只存在于控制电脑 `.env`；`.env` 已被 Git 忽略，不能提交到仓库。浏览器 API 不会返回私钥路径。

## 5. 启动与远程访问

### 开发模式

```powershell
npm run dev
```

- Vite 页面：`http://控制电脑IP:5173`
- Gateway：`http://控制电脑IP:8787`

### 生产模式（推荐用于演示和远程操作）

```powershell
npm run build
npm start
```

Gateway 会直接托管构建后的 `dist/`，其他同一受信任局域网中的电脑只需访问：

```text
http://控制电脑IP:8787
```

如果无法访问，给 Windows 防火墙添加 TCP `8787` 入站规则。不要把 Gateway、板卡 SSH 或 Indy 端口直接映射到公网；互联网远程访问应使用 VPN 或安全隧道。

## 6. 运行状态与预检

“运行状态”页会并行检查：

- 板卡21：SSH、工作目录、`tls_server` 执行权限、DID 证书、Genesis、动态库；
- 板卡22：SSH、工作目录、`tls_client` 执行权限、客户端证书、Genesis、动态库；
- Indy Ledger：从控制电脑测试配置的客户端端口是否可连接。

预检状态：

| 状态 | 含义 |
| --- | --- |
| `ready` | 当前检查通过 |
| `unreachable` | 网络、SSH、主机指纹或认证失败 |
| `misconfigured` | 远程目录、程序、证书、Genesis 或动态库缺失 |

端口预检只是网络检查。DID 是否真正完成链上查询，最终以握手中的原生 `GET_NYM` 日志为准。

## 7. 身份认证与互信验证

页面把认证执行和安全验证合并为六个固定实验场景：

| 编号 | 场景 | 当前状态 | 判定目标 |
| --- | --- | --- | --- |
| N1 | DID-TLS 单向认证 | 可执行 | 客户端验证服务端 DID、GET_NYM 与公钥绑定 |
| N2 | DID-mTLS 双向认证 | 可执行 | 客户端和服务端分别完成 DID 链上验证 |
| N3 | 传统 Client → DID Server | 待双轨接口 | 识别传统节点并协商至 PKI 轨 |
| N4 | DID Client → 传统 Server | 待双轨接口 | DID 轨不可用时由 Fallback 策略决定是否进入 PKI 轨 |
| A1 | DID 身份冒用 | 待攻击证书 | DID 存在但证书公钥与链上 VerKey 不一致，拒绝连接 |
| A2 | 未注册 DID | 待未注册证书 | GET_NYM 无身份记录，拒绝连接 |

选择场景会自动确定认证策略和节点方向，不需要再分别进入握手页和安全验证页。N3/N4 必须由板卡明确报告 DID/PKI 协商轨道；A1/A2 必须使用固定白名单证书。前端不会用普通 Traditional TLS 或静态文案冒充这些结果。

对于当前可执行的 N1/N2，Gateway 固定生成以下命令，页面不能提交任意参数：

| 模式 | 板卡21 | 板卡22 |
| --- | --- | --- |
| Traditional | `./tls_server` | `./tls_client` |
| Traditional mTLS | `./tls_server --mtls` | `./tls_client --mtls --client-cert … --client-key …` |
| DID | `./tls_server --did --server-cert … --server-key …` | `./tls_client --did` |
| DID mTLS | DID 服务端参数再加 `--mtls` | DID 客户端参数再加 `--mtls --client-cert … --client-key …` |

一次执行的顺序：

1. 通过 SSH 在板卡21启动一次性服务端，并为本次运行写入独立远程 PID 文件；
2. 使用 `ss`/`netstat` 确认配置端口已监听；
3. 通过另一条 SSH 连接在板卡22启动客户端；
4. 收集两个进程的 stdout、stderr、退出码和耗时；
5. 成功、失败或超时后清理两端本次运行的 PID，不会使用宽泛的 `pkill`；
6. Gateway 同一时间只执行一组握手，避免当前 Indy 集成的并发风险。

## 8. 结果判定

TLS 结果和 DID 结果分开判定：

- 客户端退出码为 `0` 且输出握手耗时，TLS 状态才是 `succeeded`；
- DID 单向认证要求板卡22日志出现 `GET_NYM链上查询成功`；
- DID mTLS 要求板卡22和板卡21都出现该链上成功证据；
- 出现 `Indy-VDR initialization failed`、`indy-vdr支持未编译` 或“链上验证被禁用”时，不能显示 DID 链上成功；
- 原生端没有报告证书协商字段时保持 `UNKNOWN`，页面不会猜测；
- 日志按 `client/out`、`client/err`、`server/out`、`server/err` 和 `gateway` 标记来源。

DID 错误码仍按 `DID_VerifyResult` 0–7 展示：成功、证书解析失败、DID 未找到、链上失败、公钥不匹配、有效期失败、签名失败和内部错误。

## 9. 常见问题

### `Host key verification failed`

先在运行 Gateway 的同一 Windows 用户下手工执行 `ssh root@板卡IP`，核对指纹。不要为了省事长期设置 `StrictHostKeyChecking=no`。

### `Permission denied (publickey,password)`

检查私钥路径、文件权限、板卡 `authorized_keys`，并用 `ssh -o BatchMode=yes ... "printf READY"` 复现。

### `EXECUTABLE_MISSING` / `WORKDIR_MISSING`

登录对应板卡后检查：

```bash
cd /root/openhitls-main/testcode/demo-did/build
ls -l tls_server tls_client
```

板卡21只需 `tls_server`，板卡22只需 `tls_client`。程序应具有执行权限。

### `DEPENDENCY_MISSING`

检查：

```bash
LD_LIBRARY_PATH=/root/openhitls-main/build:/root/indy-vdr/target/release ldd ./tls_server
LD_LIBRARY_PATH=/root/openhitls-main/build:/root/indy-vdr/target/release ldd ./tls_client
```

重点确认 `libindy_vdr.so` 和 openHiTLS 动态库没有显示 `not found`。

### `NATIVE_SERVER_START_TIMEOUT`

最常见原因是实际二进制监听端口与 `.env` 中 `HITLS_TLS_PORT` 不一致，或者板卡21已有进程占用端口。当前最新二进制实际使用 `12345`。

### TLS 成功但 DID 显示失败/unknown

查看验证端日志。若没有 `GET_NYM链上查询成功`，前端会保守地拒绝宣称链上成功。重点检查 `.100` 网络、Genesis、`libindy_vdr.so`、链上 DID 是否存在及证书公钥是否匹配。

## 10. API 与验证命令

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/runtime
Invoke-RestMethod http://127.0.0.1:8787/api/preflight

$body = @{ authMode = "did"; mutualTls = $false; timeoutMs = 30000 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8787/api/handshakes -ContentType application/json -Body $body
```

代码验证：

```powershell
npm run check
```

当前电脑可以完成这些代码级测试；只有控制电脑能完成最终双板卡认证与互信验证验收。
