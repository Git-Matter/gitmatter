import { SITE } from "@/marketing/site";
import { LegalPage } from "./LegalPage";

// Cloud-only marketing page. Review with counsel before production launch.
export default function Terms() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="June 20, 2026">
      <h2>1. Acceptance of terms</h2>
      <p>
        These Terms of Service are a binding agreement between you and gitmatter regarding your
        access to and use of our website, hosted application, open-source software, APIs, MCP
        connector, and related services (the "Service"). By creating an account, accepting these
        Terms, or using the Service, you agree to be bound by these Terms and our Privacy Policy. If
        you do not agree, you may not use the Service.
      </p>

      <h2>2. Service overview</h2>
      <p>
        gitmatter is an audited legal backend that AI agents plug into. It provides AI-assisted
        legal review — contract redline, tabular extraction, document generation, and reusable
        workflows — on an audit spine where every change is a commit with author, message,
        field-level diff, and blame. Agents connect over MCP (bring your own agent), and features
        run on your own LLM key (bring your own key).
      </p>
      <p>
        We may add, remove, suspend, or modify features or third-party integrations at any time. You
        are responsible for ensuring that your use of the Service, including any uploaded materials,
        complies with your confidentiality, privilege, data-protection, and professional
        obligations.
      </p>

      <h2>3. Eligibility and authority</h2>
      <p>
        You must be at least 18 years old, or the age of majority in your jurisdiction, to use the
        Service. If you use the Service on behalf of a company, law firm, or other entity, you
        represent that you have authority to bind that entity to these Terms, and "you" refers to
        that entity.
      </p>

      <h2>4. Accounts and security</h2>
      <p>
        You agree to provide accurate account information and keep it up to date. You are
        responsible for the confidentiality of your credentials and for all activity under your
        account. If you believe your account is compromised, contact us promptly.
      </p>

      <h2>5. Fees, keys, and third-party costs</h2>
      <p>
        Some features may be free, metered, usage-limited, or paid; we may introduce or change fees,
        plans, quotas, or limits with notice where required by law. If you connect your own
        third-party AI provider API keys, you are responsible for any charges, usage limits, or
        account restrictions imposed by those providers. Unless otherwise stated, fees are
        non-refundable except where required by law.
      </p>

      <h2>6. Your content and AI outputs</h2>
      <p>
        You may submit documents, prompts, files, and data ("Input") and receive AI- or
        system-generated responses, redlines, extractions, drafts, edits, and citations ("Output").
        As between you and gitmatter, you retain any rights you have in your Input. You grant
        gitmatter a limited license to host, store, process, transmit, display, and otherwise use
        your content as necessary to provide, secure, troubleshoot, and support the Service —
        including recording it on the audit spine. You represent that you have all rights and
        permissions necessary to submit your Input.
      </p>

      <h2>7. Legal and professional responsibility</h2>
      <p>
        gitmatter is a software tool. It does not provide legal, financial, tax, regulatory, or
        other professional advice, and it does not create an attorney-client relationship. AI
        systems can produce inaccurate, incomplete, outdated, or misleading Output. You are solely
        responsible for reviewing, verifying, and exercising professional judgment before relying on
        any Output or using it in client work, filings, transactions, or legal advice.
      </p>

      <h2>8. Third-party AI models and services</h2>
      <p>
        The Service routes Input to third-party AI models and infrastructure providers selected by
        you or configured by your account. Your use of those services may be subject to additional
        terms, data practices, retention settings, and usage restrictions. We are not responsible
        for third-party service availability, behavior, pricing, outages, or terms.
      </p>
      <p>
        Rights in AI-generated Output and the provider's handling of submitted content are governed
        by the terms of the AI provider you select. gitmatter does not claim ownership of your Input
        or Output.
      </p>

      <h2>9. Prohibited conduct</h2>
      <p>
        You agree not to use the Service for unlawful, harmful, infringing, deceptive, abusive, or
        security-compromising activity. You may not attempt to gain unauthorized access, interfere
        with the Service, upload malware, bypass usage limits, misrepresent your identity, scrape
        the Service except as permitted by law or the applicable open-source license, or submit
        Input you do not have the right to use.
      </p>

      <h2>10. Open-source software and ownership</h2>
      <p>
        gitmatter's source code is made available under the MIT License. Your use, copying,
        modification, and distribution of that software is governed by the MIT License text, not
        these Terms; in case of conflict, the license controls for the licensed software. The hosted
        Service, website, brand, name, design, documentation, and any non-MIT elements are owned by
        gitmatter or its licensors and protected by intellectual property and other laws.
      </p>

      <h2>11. Feedback</h2>
      <p>
        If you provide suggestions or feedback, you grant us a perpetual, irrevocable, worldwide,
        royalty-free license to use it for any purpose without obligation to compensate you.
      </p>

      <h2>12. Confidentiality</h2>
      <p>
        Each party may receive non-public information from the other in connection with the Service.
        The receiving party will use reasonable care to protect that information and use it only for
        purposes related to the Service, except where disclosure is required by law or authorized by
        the disclosing party. This does not cover information that is or becomes public through no
        fault of the receiving party, was already known without a duty of confidence, is lawfully
        received from a third party, or is independently developed.
      </p>

      <h2>13. Privacy and data protection</h2>
      <p>
        Please review our Privacy Policy for how we collect, use, store, and disclose information;
        it is incorporated into these Terms. Where gitmatter processes personal data on your behalf,
        it acts as your processor. If you use the Service on behalf of an organization and require a
        data processing agreement, contact us.
      </p>

      <h2>14. Suspension and termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate your access if you
        violate these Terms, create risk for the Service or other users, or if we discontinue the
        Service. Provisions that by their nature should survive — content, ownership,
        confidentiality, disclaimers, limitation of liability, indemnity, and dispute resolution —
        survive termination.
      </p>

      <h2>15. Disclaimers</h2>
      <p>
        The Service and Output are provided "as is" and "as available" without warranties of any
        kind, whether express, implied, or statutory, including merchantability, fitness for a
        particular purpose, non-infringement, accuracy, availability, security, and reliability. We
        do not warrant that the Service or Output will be uninterrupted, error-free, secure,
        current, complete, or suitable for any particular legal or professional use.
      </p>

      <h2>16. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, gitmatter and its affiliates, officers, employees,
        contractors, agents, suppliers, and licensors will not be liable for indirect, incidental,
        special, consequential, exemplary, or punitive damages, or for lost profits, revenue, data,
        goodwill, or business interruption. To the maximum extent permitted by law, we will not be
        liable for any damages arising out of or relating to the Service or these Terms.
      </p>

      <h2>17. Indemnity</h2>
      <p>
        You will defend, indemnify, and hold harmless gitmatter and its affiliates and personnel
        from claims, liabilities, damages, losses, and expenses (including reasonable attorneys'
        fees) arising from your use of the Service, your content, your violation of these Terms or
        of law, or your violation of third-party rights.
      </p>

      <h2>18. Export and sanctions compliance</h2>
      <p>
        You represent that you are not located in, and will not use the Service from, a country or
        region subject to comprehensive sanctions, and that you are not on any applicable restricted
        or denied-party list. You agree to comply with all applicable export-control and sanctions
        laws in your use of the Service.
      </p>

      <h2>19. Electronic communications</h2>
      <p>
        By using the Service, you consent to receive communications from us electronically —
        including notices, account messages, product updates, and legal disclosures — and agree that
        electronic communications satisfy any legal requirement that such communications be in
        writing.
      </p>

      <h2>20. Governing law and dispute resolution</h2>
      <p>
        These Terms are governed by the laws of the Federal Republic of Germany, excluding its
        conflict-of-law rules and the UN Convention on Contracts for the International Sale of
        Goods. Mandatory consumer-protection rights under the law of your country of residence
        remain unaffected. Before filing a claim, each party agrees to first attempt to resolve the
        dispute informally by contacting the other. To the extent permitted by law, the courts at
        gitmatter's registered seat have jurisdiction; where you act as a business, that venue is
        exclusive.
      </p>

      <h2>21. Changes to these terms</h2>
      <p>
        We may modify these Terms from time to time. If changes materially affect your rights, we
        will provide reasonable notice. Your continued use after the effective date means you accept
        the updated Terms; if you do not agree, you must stop using the Service.
      </p>

      <h2>22. Miscellaneous</h2>
      <p>
        These Terms and the Privacy Policy are the entire agreement between you and gitmatter
        regarding the Service. If any provision is held unenforceable, the rest remains in effect.
        Our failure to enforce a provision is not a waiver. You may not assign these Terms without
        our consent; we may assign them in connection with a merger, acquisition, or sale of assets.
        There are no third-party beneficiaries. We are not liable for delays or failures caused by
        events beyond our reasonable control.
      </p>

      <h2>23. Contact</h2>
      <p>
        If you have questions about these Terms, email{" "}
        <a href={SITE.contact} className="text-foreground underline">
          {SITE.email}
        </a>
        .
      </p>
    </LegalPage>
  );
}
