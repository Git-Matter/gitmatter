import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormError } from "../../components/form/FormError";
import { sendVerificationEmail } from "../../lib/auth/auth-client";
import { AuthShell } from "./-components/AuthShell";

export const Route = createFileRoute("/_unauth/verify-email")({
  head: () => ({
    meta: [{ title: "Verify email · gitmatter" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (
    s: Record<string, unknown>
  ): { email?: string; next?: string; sent?: string } => ({
    email: typeof s.email === "string" ? s.email : undefined,
    next: typeof s.next === "string" ? s.next : undefined,
    sent: typeof s.sent === "string" ? s.sent : undefined,
  }),
  component: VerifyEmail,
});

function VerifyEmail() {
  const { email, next, sent } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [sentNow, setSentNow] = useState(sent === "1");
  const [error, setError] = useState<string | null>(null);

  async function resendVerification() {
    if (!email) return;
    setError(null);
    setBusy(true);
    const callbackURL = new URL(
      next && next.startsWith("/") ? next : "/assistant",
      window.location.origin
    );
    const { error: verificationError } = await sendVerificationEmail({
      email,
      callbackURL: callbackURL.toString(),
    });
    setBusy(false);
    if (verificationError) {
      setError(verificationError.message ?? "Could not send verification email");
      return;
    }
    setSentNow(true);
  }

  return (
    <AuthShell title="Check your email" subtitle="One more step before you can log in.">
      <Card>
        <CardContent className="pt-6">
          {email ? (
            <div className="flex flex-col gap-stack text-sm">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground">
                  <MailCheck className="size-5" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    Verify your email to continue
                  </h2>
                  <p className="text-muted-foreground">
                    {sentNow ? "We sent a verification link to " : "Send a verification link to "}
                    <span className="break-all text-foreground">{email}</span>. Open it, then return
                    here to log in.
                  </p>
                </div>
              </div>
              <FormError>{error}</FormError>
              <Button type="button" disabled={busy} className="w-full" onClick={resendVerification}>
                {busy ? "Sending..." : sentNow ? "Send another link" : "Send verification link"}
              </Button>
              <Link to="/login" search={next ? { next } : {}} className="w-full">
                <Button type="button" variant="outline" className="w-full">
                  Use a different email
                </Button>
              </Link>
              <p className="text-center text-xs text-muted-foreground">
                Already verified? Return to login and sign in again.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-stack text-center text-sm">
              <div>
                <h2 className="text-lg font-semibold text-foreground">No email address provided</h2>
                <p className="mt-2 text-muted-foreground">
                  Return to login and enter the email you used to create your account.
                </p>
              </div>
              <Link to="/login" search={next ? { next } : {}} className="w-full">
                <Button className="w-full">Back to login</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
