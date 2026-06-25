import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { signUp } from "../../lib/auth/auth-client";
import { getSignupState } from "../../lib/auth/signup-state";
import { AuthShell } from "./-components/AuthShell";
import { Turnstile, turnstileEnabled } from "./-components/Turnstile";
import { FormError } from "../../components/form/FormError";

export const Route = createFileRoute("/_unauth/signup")({
  // Auth pages carry no SEO value — keep them out of the index.
  head: () => ({
    meta: [{ title: "Sign up · gitmatter" }, { name: "robots", content: "noindex" }],
  }),
  component: Signup,
});

function Signup() {
  const [signupsOpen, setSignupsOpen] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Bumped to force a fresh Turnstile challenge after a failed attempt — tokens
  // are single-use.
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    getSignupState()
      .then((state) => {
        if (!ignore) setSignupsOpen(state.open);
      })
      .catch(() => {
        if (!ignore) setSignupsOpen(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (signupsOpen === false) return setError("Signups are closed.");
    const trimmedName = name.trim();
    if (!trimmedName) return setError("Please enter your name.");
    setBusy(true);
    const { error: signUpError } = await signUp.email(
      { name: trimmedName, email, password },
      captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined
    );
    setBusy(false);
    if (signUpError) {
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
      return setError(signUpError.message ?? "Sign up failed");
    }
    // Full reload so the server beforeLoad re-resolves the new session and SSRs
    // the app shell (mirrors login).
    window.location.href = "/assistant";
  }

  return (
    <AuthShell title="Create your account" subtitle="Start version-controlled legal review.">
      <Card>
        <CardContent className="pt-6">
          {signupsOpen === null ? (
            <div
              className="h-44 animate-pulse rounded-md bg-muted"
              aria-label="Loading signup form"
            />
          ) : signupsOpen === false ? (
            <div className="flex flex-col gap-4 text-center">
              <div>
                <h2 className="text-lg font-semibold">Signups are closed</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  This environment is not accepting new accounts.
                </p>
              </div>
              <Link to="/login" className={buttonVariants({ className: "w-full" })}>
                Log in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-stack">
              <div className="flex flex-col gap-field">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
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
              <div className="flex flex-col gap-field">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              <Turnstile key={captchaKey} onToken={setCaptchaToken} />
              <FormError>{error}</FormError>
              <Button
                type="submit"
                disabled={busy || (turnstileEnabled && !captchaToken)}
                className="w-full"
              >
                {busy ? "Creating…" : "Sign up"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Have an account?{" "}
        <Link to="/login" className="text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
