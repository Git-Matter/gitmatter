import { LegalPage } from "./LegalPage";

// Cloud-only marketing page. DRAFT boilerplate — review with counsel before launch.
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This is a <strong>draft</strong> summary of how gitcounsel handles your data. It is not yet
        legal advice and must be reviewed by counsel before any production launch.
      </p>
      <h2>What we store</h2>
      <p>
        Your account details, the documents and matters you upload, the AI conversations you run,
        and an audit log of security-relevant events. Documents are stored in S3-compatible object
        storage; everything else lives in our database.
      </p>
      <h2>AI providers</h2>
      <p>
        gitcounsel sends document and prompt content to the AI provider you select (Anthropic,
        OpenAI, Google, or OpenRouter). With bring-your-own-key, requests go out under your own
        provider account. We request zero-data-retention handling where the provider supports it.
        See the data-handling documentation for the per-provider posture.
      </p>
      <h2>Retention &amp; deletion</h2>
      <p>
        Deleted documents are purged after a soft-delete window; aged audit logs and revoked tokens
        are purged on a schedule. Organization admins can export all tenant data at any time, and
        deleting your account removes your records.
      </p>
      <h2>Contact</h2>
      <p>For privacy questions, contact your gitcounsel administrator.</p>
    </LegalPage>
  );
}
