import { describe, expect, test } from "vite-plus/test";
import { renderEmail } from "../src/platform/emails/render.js";
import {
  DeleteAccountEmail,
  InviteEmail,
  ResetPasswordEmail,
  VerifyEmail,
} from "../src/platform/emails/templates.js";

const URL = "https://gitmatter.com/api/auth/verify-email?token=abc123";

const cases = [
  {
    name: "verify",
    element: VerifyEmail({ url: URL }),
    heading: "Confirm your email",
    cta: "Verify email",
  },
  {
    name: "reset",
    element: ResetPasswordEmail({ url: URL }),
    heading: "Reset your password",
    cta: "Reset password",
  },
  {
    name: "delete",
    element: DeleteAccountEmail({ url: URL }),
    heading: "Confirm account deletion",
    cta: "Delete my account",
  },
  {
    name: "invite",
    element: InviteEmail({ url: URL, orgName: "Acme Legal" }),
    heading: "You've been invited",
    cta: "Accept invite",
  },
] as const;

describe("transactional email templates", () => {
  for (const testCase of cases) {
    test(`${testCase.name}: html + text carry the action link, brand, heading, and CTA`, async () => {
      const { html, text } = await renderEmail(testCase.element);

      // Action link reaches both bodies.
      expect(html).toContain(URL);
      expect(text).toContain(URL);

      // Brand identity and copy present. (Heading is checked against the plain
      // text, where entities like ' are decoded — html escapes them.)
      expect(html).toContain("gitmatter");
      expect(html).toContain(testCase.cta);

      // Plain text is stripped of markup and carries the heading.
      expect(text).not.toContain("<");
      expect(text).toContain(testCase.heading.toUpperCase());

      // Regression guard: the <Font> global "* { font-family }" override (which
      // leaked serif into the button) must stay removed.
      expect(html).not.toContain("@font-face");
    });
  }

  test("delete uses the destructive accent; verify uses ink", async () => {
    const del = await renderEmail(DeleteAccountEmail({ url: URL }));
    const ver = await renderEmail(VerifyEmail({ url: URL }));
    expect(del.html).toContain("#b23a2a"); // destructive
    expect(ver.html).not.toContain("#b23a2a");
    expect(ver.html).toContain("#15181e"); // counsel ink
  });

  test("invite folds the org name into the message", async () => {
    const { text } = await renderEmail(InviteEmail({ url: URL, orgName: "Acme Legal" }));
    expect(text).toContain("Acme Legal");
  });
});
