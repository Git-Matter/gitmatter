import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { signIn } from "../../lib/auth/auth-client";
import { AuthShell } from "./-components/AuthShell";
import { Turnstile, turnstileEnabled } from "./-components/Turnstile";
import { FormError } from "../../components/form/FormError";

export const Route = createFileRoute("/_unauth/login")({
  // Auth pages carry no SEO value — keep them out of the index.
  head: () => ({ meta: [{ title: "Log in · gitmatter" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: Login,
});

function Login() {
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Bumped to force a fresh Turnstile challenge after a failed attempt — tokens
  // are single-use.
  const [captchaKey, setCaptchaKey] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signInError } = await signIn.email(
      { email, password },
      captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined
    );
    setBusy(false);
    if (signInError) {
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
      return setError(signInError.message ?? "Sign in failed");
    }
    // Full reload (not a client nav) so the server beforeLoad re-resolves the
    // now-authenticated session and SSRs the app shell. Bounce to a local
    // `next` (gated route or OAuth /authorize); only local paths, to avoid an
    // open redirect.
    window.location.href = next && next.startsWith("/") ? next : "/assistant";
  }

  async function signInWithPasskey() {
    setError(null);
    setPasskeyBusy(true);
    const { error: signInError } = await signIn.passkey();
    setPasskeyBusy(false);
    if (signInError) return setError(signInError.message ?? "Passkey sign in failed");
    window.location.href = next && next.startsWith("/") ? next : "/assistant";
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your gitmatter workspace.">
      <Card>
        <CardContent className="pt-6">
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
            <div className="flex flex-col gap-field">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Turnstile key={captchaKey} onToken={setCaptchaToken} />
            <FormError>{error}</FormError>
            <Button
              type="submit"
              disabled={busy || passkeyBusy || (turnstileEnabled && !captchaToken)}
              className="w-full"
            >
              {busy ? "Signing in…" : "Log in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || passkeyBusy}
              className="w-full"
              onClick={signInWithPasskey}
            >
              {passkeyBusy ? "Checking..." : "Sign in with passkey"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link to="/signup" className="text-foreground underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
