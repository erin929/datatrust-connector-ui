import { StatusTag } from "../ui/StatusTag";
import type { ConnectorIdentity, DIDDocument } from "../../types/domain";

type DIDBindingPanelProps = {
  connector: ConnectorIdentity;
  document: DIDDocument;
};

export function DIDBindingPanel({ connector, document }: DIDBindingPanelProps) {
  const keyMatched = connector.publicKey === document.verificationMethod[0]?.publicKey;
  const didMatched = connector.did === document.id && connector.certificateSanDid.endsWith(document.id);

  return (
    <div className="binding-panel">
      <div className="binding-column">
        <p className="mini-title">X.509 Certificate</p>
        <dl className="kv-list compact">
          <div><dt>Subject</dt><dd>CN={connector.connectorId}</dd></div>
          <div><dt>SAN</dt><dd>{connector.certificateSanDid}</dd></div>
          <div><dt>Fingerprint</dt><dd>{connector.x509Fingerprint}</dd></div>
          <div><dt>Public Key</dt><dd>{connector.publicKey}</dd></div>
        </dl>
      </div>
      <div className="binding-column">
        <p className="mini-title">DID Document</p>
        <dl className="kv-list compact">
          <div><dt>ID</dt><dd>{document.id}</dd></div>
          <div><dt>Controller</dt><dd>{document.controller}</dd></div>
          <div><dt>Status</dt><dd>{document.status}</dd></div>
          <div><dt>Public Key</dt><dd>{document.verificationMethod[0]?.publicKey}</dd></div>
        </dl>
      </div>
      <div className="binding-result">
        <StatusTag tone={didMatched ? "success" : "danger"}>SAN DID 一致</StatusTag>
        <StatusTag tone={keyMatched ? "success" : "danger"}>公钥一致</StatusTag>
        <StatusTag tone={document.status === "active" ? "success" : "danger"}>身份状态 active</StatusTag>
      </div>
    </div>
  );
}
