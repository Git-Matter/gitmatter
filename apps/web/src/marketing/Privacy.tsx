import { SITE } from "@/marketing/site";
import { LegalPage } from "./LegalPage";

// Cloud-only marketing page. Review with counsel before production launch.
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="July 17, 2026">
      <h2>1. Scope of this policy</h2>
      <p>
        This Privacy Policy explains how gitmatter handles information for the marketing website and
        the hosted application at gitmatter.com. It does not cover self-hosted deployments, where
        you run gitmatter on your own infrastructure and the gitmatter maintainers receive no data.
      </p>

      <h2>2. Controller and processor roles</h2>
      <p>
        For account and website data — the information needed to create and operate your account —
        gitmatter acts as the data controller. For the content you put into a matter (documents,
        prompts, chats, and outputs), gitmatter acts as a processor that handles that content on
        your behalf and under your instructions; you or your organization remain the controller. If
        you require a data processing agreement, contact us.
      </p>

      <h2>3. Self-hosted deployments</h2>
      <p>
        If you self-host gitmatter on your own infrastructure, database, object storage, and model
        provider keys, the gitmatter maintainers do not collect your account data, documents,
        prompts, chats, audit logs, or usage data. Your data handling depends on the systems,
        hosting providers, model providers, and configuration you choose for your deployment.
      </p>

      <h2>4. Hosted service notice</h2>
      <p>
        You are responsible for ensuring that anything you upload, submit, or store in the hosted
        service complies with your confidentiality, privilege, data-protection, and professional
        obligations.
      </p>

      <h2>5. Information we collect for the hosted service</h2>
      <p>
        When you use the hosted website or application, we may collect information needed to run it:
      </p>
      <ul>
        <li>Email address and account credentials</li>
        <li>Clients, matters, and the documents and files you upload</li>
        <li>Prompts, chat history, reviews, extractions, and AI outputs</li>
        <li>The audit spine: commits, authors, messages, field-level diffs, and blame</li>
        <li>Security-event and usage logs, settings, and preferences</li>
        <li>
          Error and diagnostic data (crash reports), with document content, keys, request bodies,
          and credentials stripped before they leave our servers
        </li>
        <li>Messages you send us by email</li>
      </ul>

      <h2>6. Legal bases for processing</h2>
      <p>
        Where data-protection law (such as the GDPR) applies, we process personal data on these
        bases: to perform our contract with you (operating your account and the Service); our
        legitimate interests (securing, troubleshooting, and improving the Service); your consent
        where we ask for it; and compliance with legal obligations. For content processed on your
        behalf, your organization is responsible for establishing the lawful basis.
      </p>

      <h2>7. AI providers, keys, and training</h2>
      <p>
        gitmatter does not train foundation models on your prompts, documents, chats, or outputs.
        When a feature runs, your document and prompt content is sent to the AI provider you select
        (Anthropic, Google, OpenAI, or OpenRouter) so the provider can generate a response. With
        bring-your-own-key, requests go out under your own provider account, and we request
        zero-data-retention handling where the provider supports it.
      </p>
      <p>
        Third-party model handling, retention, logging, and training policies are governed by that
        provider's own terms and settings. Review the policy for the provider you use:{" "}
        <a
          href="https://www.anthropic.com/legal/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline"
        >
          Anthropic
        </a>
        ,{" "}
        <a
          href="https://openai.com/policies/privacy-policy/"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline"
        >
          OpenAI
        </a>
        ,{" "}
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline"
        >
          Google
        </a>
        , and{" "}
        <a
          href="https://openrouter.ai/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline"
        >
          OpenRouter
        </a>
        . Provider keys are encrypted at rest; see the Security page for details.
      </p>

      <h2>8. Automated processing</h2>
      <p>
        AI features generate redlines, extractions, drafts, and summaries from your content. These
        are decision-support outputs, not automated decisions that produce legal or similarly
        significant effects on their own — a person reviews and decides. You are responsible for
        verifying Output before relying on it.
      </p>

      <h2>9. How we use hosted service information</h2>
      <ul>
        <li>Provide, maintain, secure, and troubleshoot the service</li>
        <li>Operate product features and keep the audit spine accurate</li>
        <li>Respond to contact, support, or security messages</li>
        <li>Understand usage and improve the product</li>
        <li>Comply with legal obligations and enforce our terms</li>
      </ul>

      <h2>10. Information sharing and subprocessors</h2>
      <p>
        We do not sell your personal information. We share information only with subprocessors and
        partners that help us operate the Service — infrastructure and hosting, object storage,
        authentication, email, analytics, error monitoring, and the AI model provider you select —
        and only as needed to run it. We may also disclose information with your consent or at your
        direction, to comply with legal obligations or court orders, or to protect rights, safety,
        security, or property. A current list of subprocessors is available on request.
      </p>

      <h2>11. International data transfers</h2>
      <p>
        We and our subprocessors may process information in countries other than yours. Where
        required, we rely on appropriate safeguards — such as the European Commission's Standard
        Contractual Clauses — for transfers of personal data outside your region.
      </p>

      <h2>12. Document storage region</h2>
      <p>
        For new hosted organizations, an administrator selects an immutable document object-storage
        target during onboarding. EU selections route document files to our Cloudflare R2 bucket
        configured for the European Union jurisdiction. US and Australian selections route document
        files to their respective regional object-storage targets. This control applies to document
        files only; account data, audit logs, backups, and AI-provider processing may have separate
        locations and are not covered by this selection.
      </p>
      <p>
        Organization administrators can download a record of the selected target and the associated
        application audit event from Settings. It should be retained with the applicable provider
        configuration evidence when assessing or documenting data-residency requirements.
      </p>

      <h2>13. Data security and breach notification</h2>
      <p>
        We use technical and organizational measures designed to protect information in the hosted
        service; see the Security page for our posture. No method of transmission or storage is
        perfectly secure. If we become aware of a breach affecting your personal data, we will
        notify you and any relevant authority as required by applicable law.
      </p>

      <h2>14. Data retention and deletion</h2>
      <p>
        Deleted documents are purged after a soft-delete window; aged audit logs and revoked tokens
        are purged on a schedule. Organization admins can export all tenant data at any time, and
        deleting your account removes your records, except where a longer retention period is
        required or permitted by law.
      </p>

      <h2>15. Your rights and how to exercise them</h2>
      <p>Depending on your location, you may have rights to:</p>
      <ul>
        <li>Access and receive a copy of your data</li>
        <li>Correct inaccurate or incomplete data</li>
        <li>Request deletion of your data</li>
        <li>Object to or restrict processing</li>
        <li>Data portability</li>
        <li>Withdraw consent where processing is based on consent</li>
      </ul>
      <p>
        To exercise a right, email us at the address below; we will respond within the time required
        by applicable law. If we process your content on behalf of your organization, we will direct
        your request to that organization. You also have the right to lodge a complaint with your
        local data-protection supervisory authority.
      </p>

      <h2>16. Cookies</h2>
      <p>
        We may use cookies and similar technologies to operate the website, keep you signed in, and
        understand usage. You can control cookies through your browser settings.
      </p>

      <h2>17. Children's privacy</h2>
      <p>
        The service is intended for business use by adults and is not directed to children. We do
        not knowingly collect personal information from anyone under 18.
      </p>

      <h2>18. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the updated policy on this
        page and update the date above.
      </p>

      <h2>19. Contact</h2>
      <p>
        For privacy questions or to exercise a right, email{" "}
        <a href={SITE.contact} className="text-foreground underline">
          {SITE.email}
        </a>
        .
      </p>
    </LegalPage>
  );
}
