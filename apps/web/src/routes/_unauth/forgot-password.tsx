import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "../../components/form/FormError";
import { requestPasswordReset } from "../../lib/auth/auth-client";
import { AuthShell } from "./-components/AuthShell";
import { Turnstile, turnstileEnabled } from "./-components/Turnstile";

export const Route = createFileRoute("/_unauth/forgot-password")({
  head: () => ({
    meta: [{ title: "Forgot password · gitmatter" }, { name: "robots", content: "noindex" }],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const redirectTo = new URL("/reset-password", window.location.origin).toString();
    const { error: resetError } = await requestPasswordReset(
      { email, redirectTo },
      captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined
    );
    setBusy(false);
    if (resetError) {
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
      return setError(resetError.message ?? "Could not send reset email");
    }
    setSent(true);
  }

  return (
    <AuthShell title="Reset your password" subtitle="Get a link to choose a new password.">
      <Card>
        <CardContent className="pt-6">
          {sent ? (
            <div className="flex flex-col gap-stack text-sm">
              <p className="text-muted-foreground">
                If this email exists in gitmatter, a reset link is on its way.
              </p>
              <Link to="/login" className={buttonVariants({ className: "w-full" })}>
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-stack">
              <div className="flex flex-col gap-field">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Turnstile key={captchaKey} onToken={setCaptchaToken} />
              <FormError>{error}</FormError>
              <Button
                type="submit"
                disabled={busy || (turnstileEnabled && !captchaToken)}
                className="w-full"
              >
                {busy ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link to="/login" className="text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
