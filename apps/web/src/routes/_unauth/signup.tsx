import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { signUp } from "../../lib/auth/auth-client";
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
    fetch("/api/config/signup")
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load signup state.");
        return (await res.json()) as { open: boolean };
      })
      .then((state) => {
        if (!ignore) setSignupsOpen(state.open);
      })
      .catch(() => {
        if (!ignore) setSignupsOpen(false);
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
    const trimmedEmail = email.trim();
    if (!trimmedName) return setError("Please enter your name.");
    if (!trimmedEmail) return setError("Please enter your email.");
    setBusy(true);
    const { data, error: signUpError } = await signUp.email(
      { name: trimmedName, email: trimmedEmail, password },
      captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined
    );
    setBusy(false);
    if (signUpError) {
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
      return setError(signUpError.message ?? "Sign up failed");
    }
    // A token in the response means auto sign-in happened (email verification not
    // required) — go straight to the app. No token means verification is needed.
    if (data?.token) {
      window.location.href = "/assistant";
      return;
    }
    const params = new URLSearchParams({ email: trimmedEmail, sent: "1", next: "/assistant" });
    window.location.href = `/verify-email?${params}`;
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
              <p className="text-center text-xs text-muted-foreground">
                By creating an account, you agree to the{" "}
                <Link to="/terms" className="text-foreground underline underline-offset-4">
                  Terms of Service
                </Link>{" "}
                and acknowledge the{" "}
                <Link to="/privacy" className="text-foreground underline underline-offset-4">
                  Privacy Policy
                </Link>
                .
              </p>
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
