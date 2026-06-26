import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "../../components/form/FormError";
import { resetPassword } from "../../lib/auth/auth-client";
import { AuthShell } from "./-components/AuthShell";

export const Route = createFileRoute("/_unauth/reset-password")({
  head: () => ({
    meta: [{ title: "Reset password · gitmatter" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (s: Record<string, unknown>): { token?: string; error?: string } => ({
    token: typeof s.token === "string" ? s.token : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token, error: searchError } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return setError("This reset link is missing a token.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setError(null);
    setBusy(true);
    const { error: resetError } = await resetPassword({ newPassword: password, token });
    setBusy(false);
    if (resetError) return setError(resetError.message ?? "Could not reset password");
    setDone(true);
  }

  const linkError = searchError ? "This reset link is invalid or expired." : null;
  const passwordReady = password.length >= 8 && confirmPassword.length >= 8;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <AuthShell title="Choose a new password" subtitle="Use the link from your email.">
      <Card>
        <CardContent className="pt-6">
          {done ? (
            <div className="flex flex-col gap-stack text-sm">
              <p className="text-muted-foreground">Your password has been changed.</p>
              <Link to="/login" className={buttonVariants({ className: "w-full" })}>
                Log in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-stack">
              <FormError>{linkError}</FormError>
              <div className="flex flex-col gap-field">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={!token || Boolean(linkError)}
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              <div className="flex flex-col gap-field">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={!token || Boolean(linkError)}
                  aria-invalid={mismatch}
                />
                {mismatch ? (
                  <p className="text-xs text-destructive">Passwords do not match.</p>
                ) : null}
              </div>
              <FormError>{error}</FormError>
              <Button
                type="submit"
                disabled={busy || !token || Boolean(linkError) || !passwordReady || mismatch}
                className="w-full"
              >
                {busy ? "Saving..." : "Reset password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Need a new link?{" "}
        <Link to="/forgot-password" className="text-foreground underline underline-offset-4">
          Request one
        </Link>
      </p>
    </AuthShell>
  );
}
