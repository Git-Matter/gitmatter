import { SITE } from "@/marketing/site";
import { LegalPage } from "./LegalPage";

// Cloud-only marketing page summarizing gitmatter's security posture.
export default function Security() {
  return (
    <LegalPage title="Security" lastUpdated="June 20, 2026">
      <p>
        Security is the core of gitmatter: the product exists to make every change to legal work
        attributable and reviewable. This page summarizes our current posture for the hosted
        service; self-hosted deployments inherit these controls but their operational security
        depends on how you run them.
      </p>

      <h2>Audit spine</h2>
      <p>
        Every change to a client, matter, review, document, or workflow — by a person in the UI or
        by an AI agent — is recorded as a commit with author, message, field-level diff, and blame,
        in one history. Mutations never bypass the commit path, so any action can be traced to the
        member or agent that made it.
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
        your account. Multi-factor authentication and single sign-on are on our roadmap and are not
        not yet available.
      </p>

      <h2>Secrets and credentials</h2>
      <p>
        Bring-your-own-key provider credentials and external-connection secrets are encrypted at
        rest with AES-256-GCM. Access tokens are stored hashed, never in plaintext. Provider keys
        are used with zero-data-retention handling where the provider supports it, and are never
        logged.
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
        Access to production systems is limited to personnel who need it to operate the Service, and
        we do not access tenant content except as necessary to provide, secure, or troubleshoot the
        Service, or as required by law.
      </p>

      <h2>Data in transit and at rest</h2>
      <p>
        Traffic to the hosted service is served over TLS. Documents are stored in S3-compatible
        object storage; account, matter, and audit data live in the database. Deleted documents are
        purged after a soft-delete window, and revoked tokens and aged audit logs are purged on a
        schedule.
      </p>

      <h2>Backups and resilience</h2>
      <p>
        The database is backed up on a regular schedule to support recovery from failures. Backups
        inherit the same access controls as production data. gitmatter does not currently offer a
        formal uptime or recovery-time commitment.
      </p>

      <h2>Subprocessors and hosting</h2>
      <p>
        The hosted service runs on third-party infrastructure, object storage, authentication,
        email, error monitoring, and AI model providers. Error reports are scrubbed of document
        content, keys, request bodies, and credentials before they leave our servers and are
        processed in the EU. Document and prompt content is sent only to the AI provider you select
        (Anthropic, Google, OpenAI, or OpenRouter), under your own key where configured. gitmatter
        does not train models on your data. A current list of subprocessors is available on request.
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
