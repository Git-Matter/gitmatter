import { LegalPage } from "./LegalPage";

// Cloud-only marketing page. DRAFT boilerplate — review before launch.
export default function Security() {
  return (
    <LegalPage title="Security">
      <p>
        This is a <strong>draft</strong> summary of gitcounsel's security posture, pending review
        before launch.
      </p>
      <h2>Audit trail</h2>
      <p>
        Every change to a matter, review, document, or workflow is recorded on a git-style commit
        spine with author, message, and blame. Security events — logins, key and token lifecycle,
        OAuth grants, uploads and downloads — are written to a separate audit log.
      </p>
      <h2>Secrets &amp; credentials</h2>
      <p>
        Bring-your-own-key provider credentials and external-connection secrets are encrypted at
        rest with AES-256-GCM. Access tokens are stored hashed, never in plaintext.
      </p>
      <h2>Access &amp; isolation</h2>
      <p>
        Data is scoped per organization (tenant); object-storage keys mirror the tenant boundary.
        OAuth and MCP access is bound to the issuing user and the gitcounsel resource.
      </p>
      <h2>Reporting</h2>
      <p>Report suspected vulnerabilities to your gitcounsel administrator.</p>
    </LegalPage>
  );
}
