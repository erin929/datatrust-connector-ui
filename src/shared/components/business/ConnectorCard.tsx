import { StatusTag } from "../ui/StatusTag";
import type { ConnectorIdentity } from "../../types/domain";

type ConnectorCardProps = {
  connector: ConnectorIdentity;
};

export function ConnectorCard({ connector }: ConnectorCardProps) {
  const roleLabel = connector.role === "provider" ? "Provider Connector" : "Consumer Connector";

  return (
    <div className="connector-card">
      <div className="connector-card__head">
        <div>
          <p>{roleLabel}</p>
          <h3>{connector.connectorId}</h3>
        </div>
        <StatusTag tone="success">{connector.status}</StatusTag>
      </div>
      <dl className="kv-list">
        <div><dt>DID</dt><dd>{connector.did}</dd></div>
        <div><dt>证书 SAN DID</dt><dd>{connector.certificateSanDid}</dd></div>
        <div><dt>X.509 指纹</dt><dd>{connector.x509Fingerprint}</dd></div>
        <div><dt>公钥</dt><dd>{connector.publicKey}</dd></div>
        <div><dt>机构域</dt><dd>{connector.domain}</dd></div>
        <div><dt>信任等级</dt><dd>{connector.trustLevel}</dd></div>
      </dl>
    </div>
  );
}
