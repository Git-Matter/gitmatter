import { SITE } from "@/marketing/site";
import { LegalPage } from "./LegalPage";

// Cloud-only marketing page summarizing gitmatter's security posture.
export default function Security() {
  return (
    <LegalPage title="Security" lastUpdated="November 17, 2026">
      <p>
        Security is the core of gitmatter: the product exists to make every change to legal work
        attributable and reviewable. This page describes application controls and the deployment
        configuration to verify. Hosting, operator access, backups and connected services need their
        own operational checks.
      </p>

      <h2>Audit spine</h2>
      <p>
        Legal content mutations through gitmatter's shared engine record an author, message and
        field-level diff in an artifact history. Human decisions retain the originating proposal and
        agent attribution. Permissions and matter approval policies govern which changes can be
        applied.
      </p>

      <h2>Security event logging</h2>
      <p>
        Security-relevant events — logins, key and token lifecycle, OAuth grants, MCP connections,
        and uploads and downloads — are written to a separate audit log so that access and
        credential activity is reviewable independently of content changes.
      </p>

      <h2>Authentication and sessions</h2>
      <p>
        Accounts use email and password, with credentials stored using a strong one-way hash and
        sessions managed by our authentication layer. We recommend a unique, strong password for
        your account. You can enable two-factor authentication with an authenticator app in Settings
        and retain backup codes for recovery. Single sign-on is not currently available.
      </p>

      <h2>Secrets and credentials</h2>
      <p>
        Bring-your-own-key provider credentials and external-connection secrets are encrypted at
        rest with AES-256-GCM. Stored MCP bearer tokens use hashes. The provider-key settings API
        returns configuration status, not saved key values. Built-in AI uses a saved provider key
        first, then a server key if configured.
      </p>
      <p>
        OpenAI requests disable response application-state storage. OpenRouter requests filter
        endpoints using its data-collection policy; they do not send an explicit zero-retention
        flag. These controls do not establish account-level zero retention. Anthropic and Gemini
        handling also depends on the service, model, account controls and agreement. gitmatter does
        not verify provider zero-retention eligibility or Gemini paid-service eligibility. See the{" "}
        <a href={`${SITE.docs}/admin/ai-data-handling`} className="text-foreground underline">
          AI data-handling guide
        </a>{" "}
        for the actual request controls and provider conditions.
      </p>

      <h2>Access and tenant isolation</h2>
      <p>
        Data is scoped per organization (tenant), and object-storage keys mirror the tenant
        boundary. Within a tenant, access follows the legal team staffed on each matter. OAuth and
        MCP access is bound to the issuing user and the gitmatter resource, so a connected agent
        acts only with that user's authority.
      </p>

      <h2>Operator access</h2>
      <p>
        Operator permissions and support access depend on the deployment and its operating
        procedures. Confirm who can access infrastructure and tenant content, and how that access is
        authorized and reviewed, with the deployment operator.
      </p>

      <h2>Data in transit and at rest</h2>
      <p>
        Documents use S3-compatible object storage; account, matter and audit data live in the
        database. TLS termination and storage encryption beyond the application's encrypted
        credentials depend on the deployment. Verify those controls for the environment you use.
      </p>
      <p>
        Eligible retention cleanup runs at process startup; document deletion also triggers
        opportunistic cleanup. Cleanup is best effort, so eligibility is not a guaranteed deletion
        deadline or proof that every stored copy was removed. Shared artifact history, chat
        retention and backups have separate rules.
      </p>

      <h2>Backups and resilience</h2>
      <p>
        The repository includes database backup and restore tooling. Backup schedules, storage
        locations, retention, access controls and restore testing depend on the deployment. Verify
        those arrangements with its operator. gitmatter does not currently offer a formal uptime or
        recovery-time commitment.
      </p>

      <h2>Subprocessors and hosting</h2>
      <p>
        The hosted service runs on third-party infrastructure, object storage, authentication,
        email, error monitoring and AI model providers. The Sentry request filter removes captured
        request bodies and cookies, and redacts selected authentication headers. It does not
        comprehensively sanitize free-form exception messages or every telemetry field. Reporting
        destinations and processing regions depend on deployed services and configuration.
      </p>
      <p>
        Built-in AI sends prompts and document context to the selected model's service. OpenRouter
        forwards requests to a model provider. Connected assistants receive the tool results they
        request; research and external tools can involve other services. Review those services'
        terms separately from gitmatter's storage and built-in API controls. gitmatter does not
        train models on your data. A current list of subprocessors is available on request.
      </p>

      <h2>Vulnerability management</h2>
      <p>
        We keep dependencies and runtime images updated and apply security patches as part of normal
        operations. The codebase is open-source under the MIT License, so the community can review
        and report issues.
      </p>

      <h2>Incident response</h2>
      <p>
        If we become aware of a security incident affecting your data, we will investigate, take
        steps to contain and remediate it, and notify affected users and any relevant authority as
        required by applicable law.
      </p>

      <h2>Security limitations</h2>
      <p>
        The hosted application has not completed a formal security certification, and no method of
        transmission or storage is perfectly secure. Review your obligations before uploading
        sensitive, confidential, privileged, or client materials.
      </p>

      <h2>Reporting a vulnerability</h2>
      <p>
        If you discover a suspected vulnerability, please report it to{" "}
        <a href={SITE.contact} className="text-foreground underline">
          {SITE.email}
        </a>
        . We will not pursue legal action against good-faith research that respects user privacy,
        avoids data destruction or service disruption, and gives us a reasonable opportunity to fix
        the issue before public disclosure.
      </p>
    </LegalPage>
  );
}
