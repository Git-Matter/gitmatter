import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { signIn } from "../../lib/auth/auth-client";
import { AuthShell } from "./-components/AuthShell";
import { FormError } from "../../components/form/FormError";

export const Route = createFileRoute("/_unauth/login")({
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
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signInError } = await signIn.email({ email, password });
    setBusy(false);
    if (signInError) return setError(signInError.message ?? "Sign in failed");
    // Full reload (not a client nav) so the server beforeLoad re-resolves the
    // now-authenticated session and SSRs the app shell. Bounce to a local
    // `next` (gated route or OAuth /authorize); only local paths, to avoid an
    // open redirect.
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <FormError>{error}</FormError>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Log in"}
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
