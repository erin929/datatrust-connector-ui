import { useMemo, useState } from "react";
import { ConnectorCard } from "./shared/components/business/ConnectorCard";
import { DIDBindingPanel } from "./shared/components/business/DIDBindingPanel";
import { FabricEventStream } from "./shared/components/business/FabricEventStream";
import { JsonBlock } from "./shared/components/business/JsonBlock";
import { PolicyMatrix } from "./shared/components/business/PolicyMatrix";
import { SecurityScenarioCard } from "./shared/components/business/SecurityScenarioCard";
import { Timeline } from "./shared/components/business/Timeline";
import { SectionCard } from "./shared/components/ui/SectionCard";
import { StatusTag } from "./shared/components/ui/StatusTag";
import {
  accessTrace,
  connectors,
  contract,
  dataProduct,
  deliveredV1,
  deliveredV2,
  didDocuments,
  fabricEvents,
  fieldPoliciesV1,
  fieldPoliciesV2,
  handshakeSteps,
  rawRecord,
  securityScenarios,
} from "./shared/data/mock";
import "./styles/global.css";

const navigation = [
  { id: "overview", label: "演示总览" },
  { id: "identity", label: "连接器身份" },
  { id: "channel", label: "DID-mTLS 可信通道" },
  { id: "catalog", label: "数据产品目录" },
  { id: "contract", label: "数字合约" },
  { id: "delivery", label: "字段级受控交付" },
  { id: "policy", label: "策略动态更新" },
  { id: "audit", label: "Fabric 审计追踪" },
  { id: "security", label: "安全验证" },
];

function App() {
  const [active, setActive] = useState("overview");
  const provider = connectors[0];
  const consumer = connectors[1];
  const providerDid = didDocuments[0];
  const consumerDid = didDocuments[1];

  const contractJson = useMemo(() => ({
    contractId: contract.contractId,
    productId: contract.productId,
    providerConnectorId: contract.providerConnectorId,
    consumerConnectorId: contract.consumerConnectorId,
    purpose: contract.purpose,
    validFrom: contract.validFrom,
    validTo: contract.validTo,
    policyVersion: contract.policyVersion,
    fieldPolicies: contract.fieldPolicies.map(({ field, action }) => ({ field, action })),
    contractHash: contract.contractHash,
    fabricTxHash: contract.fabricTxHash,
  }), []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span>DataTrust</span>
          <strong>Connector</strong>
          <small>可信数据连接器演示控制台</small>
        </div>
        <nav>
          {navigation.map((item) => (
            <button className={active === item.id ? "active" : ""} key={item.id} onClick={() => setActive(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p>连接器注册 → PKI-DID 双轨互信 → DID-mTLS → 合约 → 字段交付 → Fabric 审计</p>
            <h1>{navigation.find((item) => item.id === active)?.label}</h1>
          </div>
          <div className="topbar__status">
            <StatusTag tone="success">DID-mTLS 已建立</StatusTag>
            <StatusTag tone="info">policy v1</StatusTag>
            <StatusTag tone="success">Fabric Connected</StatusTag>
          </div>
        </header>

        {active === "overview" && (
          <div className="page-grid">
            <SectionCard title="端到端可信数据流通主线" eyebrow="Demo Flow" className="wide">
              <div className="flow-line">
                {[
                  "连接器注册",
                  "X.509 与 DID 绑定",
                  "DID-mTLS 可信通道",
                  "数据目录查询",
                  "数字合约",
                  "字段级受控交付",
                  "Fabric 审计追踪",
                  "安全验证",
                ].map((step) => <div className="flow-node" key={step}>{step}</div>)}
              </div>
            </SectionCard>
            <ConnectorCard connector={provider} />
            <ConnectorCard connector={consumer} />
            <SectionCard title="关键状态" eyebrow="Trust Snapshot">
              <div className="metric-grid">
                <div><strong>2</strong><span>注册连接器</span></div>
                <div><strong>2</strong><span>有效 DID</span></div>
                <div><strong>1</strong><span>活跃合约</span></div>
                <div><strong>7</strong><span>Fabric 事件</span></div>
              </div>
            </SectionCard>
            <SectionCard title="最近 Fabric 事件" eyebrow="Audit Stream">
              <FabricEventStream events={fabricEvents.slice(0, 4)} />
            </SectionCard>
          </div>
        )}

        {active === "identity" && (
          <div className="page-grid">
            <SectionCard title="Provider PKI-DID 双凭证绑定" eyebrow="Identity Context" className="wide">
              <DIDBindingPanel connector={provider} document={providerDid} />
            </SectionCard>
            <SectionCard title="Consumer PKI-DID 双凭证绑定" eyebrow="Identity Context" className="wide">
              <DIDBindingPanel connector={consumer} document={consumerDid} />
            </SectionCard>
          </div>
        )}

        {active === "channel" && (
          <div className="page-grid">
            <SectionCard title="DID-mTLS 握手时间线" eyebrow="TrustGate-DID" className="wide">
              <Timeline steps={handshakeSteps} />
            </SectionCard>
            <SectionCard title="通道安全参数" eyebrow="Channel Profile">
              <dl className="kv-list">
                <div><dt>认证模式</dt><dd>DID-mTLS</dd></div>
                <div><dt>证书模式</dt><dd>DID Certificate</dd></div>
                <div><dt>传统密钥协商</dt><dd>ECDHE-P256</dd></div>
                <div><dt>抗量子增强</dt><dd>optional / reserved</dd></div>
                <div><dt>通道安全等级</dt><dd>HIGH</dd></div>
              </dl>
            </SectionCard>
            <SectionCard title="模式兼容" eyebrow="Fallback">
              <div className="mode-stack">
                <StatusTag tone="neutral">传统 TLS</StatusTag>
                <StatusTag tone="neutral">传统 mTLS</StatusTag>
                <StatusTag tone="info">DID-TLS</StatusTag>
                <StatusTag tone="success">DID-mTLS</StatusTag>
              </div>
            </SectionCard>
          </div>
        )}

        {active === "catalog" && (
          <div className="page-grid">
            <SectionCard title={dataProduct.name} eyebrow="Data Product" className="wide">
              <div className="product-hero">
                <div>
                  <h3>{dataProduct.productId}</h3>
                  <p>{dataProduct.description}</p>
                </div>
                <div className="mode-stack">
                  <StatusTag tone="success">Provider DID 已验证</StatusTag>
                  <StatusTag tone="info">{dataProduct.policyTemplateId}</StatusTag>
                  <StatusTag tone="success">API Delivery</StatusTag>
                </div>
              </div>
              <PolicyMatrix fields={dataProduct.schema} policies={fieldPoliciesV1} />
            </SectionCard>
          </div>
        )}

        {active === "contract" && (
          <div className="page-grid">
            <SectionCard title="数字合约 contract-001" eyebrow="Digital Contract" className="wide">
              <JsonBlock title="合约 JSON" value={contractJson} />
            </SectionCard>
            <SectionCard title="合约状态" eyebrow="Contract State">
              <dl className="kv-list">
                <div><dt>状态</dt><dd><StatusTag tone="success">{contract.status}</StatusTag></dd></div>
                <div><dt>用途</dt><dd>{contract.purpose}</dd></div>
                <div><dt>策略版本</dt><dd>v{contract.policyVersion}</dd></div>
                <div><dt>合约哈希</dt><dd>{contract.contractHash}</dd></div>
                <div><dt>Fabric Tx</dt><dd>{contract.fabricTxHash}</dd></div>
              </dl>
            </SectionCard>
          </div>
        )}

        {active === "delivery" && (
          <div className="page-grid">
            <SectionCard title="字段级受控交付" eyebrow="Controlled Delivery" className="wide">
              <div className="json-grid">
                <JsonBlock title="原始数据" value={rawRecord} />
                <JsonBlock title="policy v1 交付结果" value={deliveredV1} />
              </div>
              <PolicyMatrix fields={dataProduct.schema} policies={fieldPoliciesV1} />
            </SectionCard>
            <SectionCard title="策略命中链路" eyebrow="Trace">
              <Timeline steps={accessTrace.steps} />
            </SectionCard>
          </div>
        )}

        {active === "policy" && (
          <div className="page-grid">
            <SectionCard title="策略版本动态更新" eyebrow="Policy Diff" className="wide">
              <div className="policy-diff">
                <PolicyMatrix fields={dataProduct.schema} policies={fieldPoliciesV1} />
                <PolicyMatrix fields={dataProduct.schema} policies={fieldPoliciesV2} />
              </div>
              <div className="json-grid">
                <JsonBlock title="v1 返回结果：phone=mask" value={deliveredV1} />
                <JsonBlock title="v2 返回结果：phone=deny" value={deliveredV2} />
              </div>
            </SectionCard>
          </div>
        )}

        {active === "audit" && (
          <div className="page-grid">
            <SectionCard title="Fabric 事件流" eyebrow="On-chain Audit" className="wide">
              <p className="notice">链上不存敏感原文，只保存合约哈希、策略版本、访问事件、交付摘要和 traceId。</p>
              <FabricEventStream events={fabricEvents} />
            </SectionCard>
            <SectionCard title="trace-002 全链路追踪" eyebrow="Trace Timeline">
              <Timeline steps={accessTrace.steps} />
              <dl className="kv-list compact">
                <div><dt>requestHash</dt><dd>{accessTrace.requestHash}</dd></div>
                <div><dt>responseHash</dt><dd>{accessTrace.responseHash}</dd></div>
                <div><dt>Fabric Tx</dt><dd>{accessTrace.fabricTxHash}</dd></div>
              </dl>
            </SectionCard>
          </div>
        )}

        {active === "security" && (
          <div className="scenario-grid">
            {securityScenarios.map((scenario) => <SecurityScenarioCard scenario={scenario} key={scenario.id} />)}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
