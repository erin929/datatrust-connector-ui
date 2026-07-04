# DataTrust Connector 前端演示系统

这是一个面向可信数据空间数据连接器场景的前端演示页面，用于展示 `TrustGate-DID` 作品中的连接器可信接入、DID-mTLS 认证、数字合约、字段级受控交付、策略动态更新和 Fabric 审计追踪等核心流程。

前端项目基于 `Vite + React + TypeScript` 构建，当前为本地演示版本，页面数据来自 `src/shared/data/mock.ts` 中的 Mock 数据。

## 一、运行环境要求

本机需要安装：

- Node.js，建议使用 18 或更高版本
- npm，通常安装 Node.js 后会自带

可以在终端中检查：

```bash
node -v
npm -v
```

如果能看到版本号，说明环境基本可用。

## 二、在自己电脑上运行前端

### 1. 打开终端

可以使用 Windows PowerShell、CMD、Cursor 内置终端或 VS Code 内置终端。

### 2. 进入前端项目目录

```bash
cd C:\Users\juzid\Desktop\did\DidWeb
```

如果你的项目移动到了其他位置，请把路径替换成实际的 `DidWeb` 文件夹路径。

### 3. 安装依赖

第一次运行前需要执行：

```bash
npm install
```

如果已经安装过依赖，可以跳过这一步。

### 4. 启动开发服务

```bash
npm run dev
```

启动成功后，终端会输出类似下面的地址：

```text
Local: http://localhost:5173/
```

在浏览器中打开该地址即可访问前端页面。

如果 `5173` 端口被占用，Vite 可能会自动换成 `5174`、`5175` 等端口，请以终端实际显示的 `Local` 地址为准。

## 三、常用命令

### 启动开发环境

```bash
npm run dev
```

用于本地开发和页面预览。

### 构建生产版本

```bash
npm run build
```

用于检查 TypeScript 类型和生成生产构建文件。构建结果会输出到 `dist/` 目录。

### 预览生产构建

```bash
npm run preview
```

需要先执行 `npm run build`，再执行该命令预览构建后的页面。

## 四、页面功能介绍

当前前端采用左侧导航切换不同演示页面，整体围绕以下主线：

```text
连接器注册 → PKI-DID 双轨互信 → DID-mTLS 可信通道 → 数据目录查询 → 数字合约 → 字段级受控交付 → 策略动态更新 → Fabric 审计追踪 → 安全验证
```

### 1. 演示总览

展示 DataTrust Connector 的端到端数据流通主线，包括连接器注册、X.509 与 DID 绑定、DID-mTLS 可信通道、数据目录、数字合约、字段交付和 Fabric 审计。

### 2. 连接器身份

展示 Provider Connector 和 Consumer Connector 的身份上下文，包括：

- connectorId
- DID
- X.509 证书指纹
- 证书 SAN DID
- DID Document
- 公钥一致性校验
- DID 状态校验

该页面用于体现 PKI-DID 双轨互信机制。

### 3. DID-mTLS 可信通道

展示 DID-mTLS 握手过程，包括：

- ClientHello 携带 DID 认证模式
- ServerHello 返回 DID 认证模式
- 证书中携带 DID
- 查询 DID Document
- 校验证书公钥与 DID Document 公钥一致性
- 双向认证完成

该页面用于体现 DID 身份状态接入 TLS 握手认证链路。

### 4. 数据产品目录

展示 Provider Connector 发布的数据产品目录和字段结构。目前 Mock 数据中包含一个订单交易数据产品：

- `order_id`
- `region`
- `phone`
- `id_card`
- `payment_account`

每个字段具有不同敏感等级，为后续字段级受控交付提供基础。

### 5. 数字合约

展示 Consumer Connector 与 Provider Connector 之间生成的数字合约内容，包括：

- contractId
- productId
- providerConnectorId
- consumerConnectorId
- purpose
- validFrom / validTo
- policyVersion
- fieldPolicies
- contractHash
- fabricTxHash

该页面用于体现数字合约对数据使用目的、有效期和字段策略的约束。

### 6. 字段级受控交付

展示系统如何根据数字合约和字段策略处理 JSON 字段。

当前支持四类字段处理动作：

| 动作 | 含义 |
| --- | --- |
| `plain` | 明文返回 |
| `mask` | 脱敏返回 |
| `encrypt` | 加密返回 |
| `deny` | 拒绝返回 |

示例中：

- `order_id` 明文返回
- `region` 明文返回
- `phone` 脱敏返回
- `id_card` 加密返回
- `payment_account` 拒绝返回

该页面用于体现“接口可访问”不等于“所有字段都可返回”的最小披露机制。

### 7. 策略动态更新

展示字段策略从 `policy v1` 到 `policy v2` 的变化。

例如：

- v1 中 `phone` 字段执行 `mask`
- v2 中 `phone` 字段调整为 `deny`

该页面用于体现字段级策略可以动态更新，并影响后续数据交付结果。

### 8. Fabric 审计追踪

展示链上审计事件流和 `traceId` 全链路追踪，包括：

- ConnectorRegistered
- ContractSigned
- PolicyUpdated
- DataAccessRequested
- DataDelivered
- ViolationDetected

该页面强调链上不保存原始敏感数据，只保存：

- 合约哈希
- 策略版本
- 请求摘要
- 响应摘要
- traceId
- Fabric 交易哈希

用于支撑合约履行证明、访问行为追踪和异常事件定位。

### 9. 安全验证

展示多个安全异常场景，例如：

- 未注册 DID
- 证书公钥与 DID Document 公钥不一致
- 越权字段访问
- 过期合约调用

每个场景展示风险输入、拦截位置、处置结果和模拟日志。

## 五、项目目录结构

```text
DidWeb
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── skills
│   └── datatrust-connector-frontend.skill.md
└── src
    ├── App.tsx
    ├── main.tsx
    ├── vite-env.d.ts
    ├── styles
    │   └── global.css
    └── shared
        ├── components
        │   ├── business
        │   │   ├── ConnectorCard.tsx
        │   │   ├── DIDBindingPanel.tsx
        │   │   ├── FabricEventStream.tsx
        │   │   ├── JsonBlock.tsx
        │   │   ├── PolicyMatrix.tsx
        │   │   ├── SecurityScenarioCard.tsx
        │   │   └── Timeline.tsx
        │   └── ui
        │       ├── SectionCard.tsx
        │       └── StatusTag.tsx
        ├── data
        │   └── mock.ts
        ├── types
        │   └── domain.ts
        └── utils
            └── format.ts
```

## 六、核心文件说明

### `src/App.tsx`

前端主页面文件，负责页面导航和主要内容展示。

### `src/shared/data/mock.ts`

Mock 数据文件，包含连接器身份、DID Document、数据产品、数字合约、字段策略、访问链路、Fabric 事件和安全场景。

### `src/shared/types/domain.ts`

领域类型定义文件，用于约束连接器、合约、字段策略、审计事件等数据结构。

### `src/styles/global.css`

全局样式文件，定义页面布局、侧边栏、卡片、表格、时间线、状态标签等样式。

### `skills/datatrust-connector-frontend.skill.md`

前端制作约束文件。后续继续扩展页面时，应继续围绕该 skill 中定义的前端主线、模块划分和展示逻辑进行开发。

## 七、如果页面打不开怎么办

### 1. 检查是否进入正确目录

确保终端当前目录是：

```text
C:\Users\juzid\Desktop\did\DidWeb
```

可以执行：

```bash
pwd
```

或在 PowerShell 中执行：

```powershell
Get-Location
```

### 2. 检查依赖是否安装

如果提示找不到 `vite` 或 `react`，执行：

```bash
npm install
```

### 3. 检查端口地址

不要固定只看 `5173`，以终端输出的 `Local` 地址为准。

### 4. 重新启动服务

如果页面卡住或报错，可以停止服务后重新启动。

在终端中按：

```text
Ctrl + C
```

然后重新执行：

```bash
npm run dev
```

## 八、后续可扩展方向

后续可以继续扩展：

1. 将 `App.tsx` 中不同页面拆分成独立模块。
2. 增加真实后端接口对接。
3. 增加 DID-mTLS 握手动画。
4. 增加 Fabric 事件详情抽屉。
5. 增加字段策略编辑器。
6. 增加策略版本对比和访问结果重放。
7. 增加答辩演示模式，一键按流程播放。

## 九、当前定位

当前前端是作品展示和答辩演示原型，重点是把 TrustGate-DID 的系统思路可视化表达出来：

- 不是普通数据管理后台；
- 不是传统接口调用页面；
- 不是单纯 DID 展示页面；
- 而是围绕可信数据空间中 Provider Connector 与 Consumer Connector 的安全互操作闭环进行展示。
