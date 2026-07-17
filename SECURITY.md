# Security Policy

Security is central to gitmatter. The product handles legal documents, authentication data, and
encrypted LLM provider keys, while preserving an attributable audit history for every mutation.

## Supported Versions

Security fixes are made against the latest released version. Self-hosted users should upgrade to
the newest release before reporting an issue that may already have been fixed.

| Version        | Supported |
| -------------- | --------- |
| Latest release | Yes       |
| Older releases | No        |

## Reporting a Vulnerability

Do not open a public GitHub issue, discussion, or pull request for a suspected vulnerability.

Use [GitHub's private vulnerability reporting
form](https://github.com/Git-Matter/gitmatter/security/advisories/new). If you cannot use GitHub,
email [contact@gitmatter.com](mailto:contact@gitmatter.com) with the subject
`Security vulnerability: <short description>`.

Please include:

- the affected version, deployment type, and component
- a clear description of the issue and its potential impact
- the steps or proof of concept needed to reproduce it
- any suggested mitigation, if known
- a safe way to contact you for follow-up

Do not include real legal documents, production credentials, provider keys, access tokens, or other
sensitive customer data. Use minimal test data and redact secrets from logs and screenshots.

We will acknowledge the report, investigate it, and coordinate remediation and disclosure with the
reporter. Please keep the vulnerability confidential until a fix is available and disclosure has
been coordinated.

## Scope

Examples of issues that should be reported privately include:

- authentication or authorization bypasses
- cross-matter or cross-organization data access
- exposure of legal documents, credentials, access tokens, or LLM provider keys
- encryption or key-management failures
- mutations that bypass attribution, commits, diffs, or blame in the audit spine
- injection, request forgery, remote code execution, or unsafe file-processing vulnerabilities
- vulnerabilities in gitmatter's MCP, API, web, CLI, or self-hosted deployment surfaces

General bugs, setup questions, and feature requests are not security reports. Use
[GitHub Discussions](https://github.com/Git-Matter/gitmatter/discussions) or the public issue
templates for those.

## Safe Harbor

We support good-faith security research that avoids privacy violations, data loss, service
disruption, and access to data beyond what is needed to demonstrate the issue. Do not use social
engineering, physical attacks, denial of service, automated high-volume testing, or third-party
systems outside gitmatter's control.

If you follow this policy, make a good-faith effort to avoid harm, and report your findings
promptly, we will treat your research as authorized and work with you to understand and resolve the
issue.
