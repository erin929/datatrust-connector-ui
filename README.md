# DataTrust Connector UI（双板卡真实握手版）

这是 `openHiTLS + Indy DID` 的真实控制前端。页面保持原有运营平台风格，由控制电脑上的 Connector Gateway 通过 SSH 调度两块鸿蒙智能基座：

```text
远程浏览器
    │ HTTP :8787
    ▼
控制电脑：React 静态页面 + Node Gateway
    ├── SSH ──► 板卡21：tls_server
    └── SSH ──► 板卡22：tls_client
                      │ DID-TLS 192.168.50.21:12347
                      ▼
                   板卡21
    两块板卡 ───────► Indy Ledger 192.168.50.100
```

浏览器不能提交 SSH 命令、程序路径或证书路径。所有目标均来自控制电脑的 `.env` 白名单配置。

完整安装、密钥配置、页面使用和排障说明见 [前端使用指南](docs/frontend-usage-guide.zh-CN.md)。

## 与最新板卡代码的对齐

- 板卡21运行 `/root/openhitls-main/testcode/demo-did/build/tls_server`；
- 板卡22运行 `/root/openhitls-main/testcode/demo-did/build/tls_client`；
- 当前客户端二进制固定连接 `192.168.50.21:12347`；
- 支持 Traditional TLS、DID-TLS，以及两者的 mTLS；
- 最新 `--fallback` 不等价于旧 `Auto`，所以硬件模式禁用 Auto；
- DID 成功必须出现验证端的 `GET_NYM链上查询成功` 日志；出现 Indy-VDR 未初始化/未编译警告时不会报告链上验证成功；
- 每次握手分别记录板卡21和板卡22的日志、退出码、HITLS 错误码和超时状态。

旧 `unified_tls_*` 本机模式仍保留，配置模板见 `.env.local.example`。

## 控制电脑快速启动

需要 Node.js `^20.19.0` 或 `>=22.12.0`、Windows OpenSSH 客户端，以及无需交互密码的 SSH 密钥或 ssh-agent。

```powershell
git clone https://github.com/erin929/datatrust-connector-ui.git
cd datatrust-connector-ui
npm install
Copy-Item .env.example .env
```

编辑 `.env` 后，先手工登录一次两块板卡，以确认密钥并写入 `known_hosts`：

```powershell
ssh root@192.168.50.21
ssh root@192.168.50.22
```

开发模式：

```powershell
npm run dev
```

生产/远程访问模式：

```powershell
npm run build
npm start
```

Gateway 会直接托管 `dist/`。同一受信任局域网中的浏览器访问：

```text
http://控制电脑IP:8787
```

不要把 `8787`、板卡 SSH 或 Indy 端口直接暴露到公网；互联网访问应放在 VPN/安全隧道后面。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | Gateway 简要状态 |
| `GET` | `/api/runtime` | 公开运行配置与能力边界 |
| `GET` | `/api/preflight` | 并行检查两块板卡 SSH、远程文件/依赖和 Indy 端口 |
| `GET` | `/api/handshakes` | 当前 Gateway 进程内最多 50 条历史 |
| `POST` | `/api/handshakes` | 启动一次真实双板卡握手 |

## 验证

```powershell
npm run check
```

测试覆盖本机兼容参数、硬件参数映射、Auto 边界、SSH 参数与 Shell 引号、硬件默认配置，以及 DID 链上成功/失败的保守解析。
