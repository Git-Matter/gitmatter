import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
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
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Bumped to force a fresh Turnstile challenge after a failed attempt — tokens
  // are single-use.
  const [captchaKey, setCaptchaKey] = useState(0);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: signInError } = await signIn.email(
        { email: value.email, password: value.password },
        captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined
      );
      if (signInError) {
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
        if (isEmailVerificationError(signInError)) {
          const params = new URLSearchParams({ email: value.email, sent: "1" });
          if (next?.startsWith("/")) params.set("next", next);
          window.location.href = `/verify-email?${params}`;
          return;
        }
        setError(signInError.message ?? "Sign in failed");
        return;
      }
      // Full reload (not a client nav) so the server beforeLoad re-resolves the
      // now-authenticated session and SSRs the app shell. Bounce to a local
      // `next` (gated route or OAuth /authorize); only local paths, to avoid an
      // open redirect.
      window.location.href = next && next.startsWith("/") ? next : "/assistant";
    },
  });

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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
            className="flex flex-col gap-stack"
          >
            <form.Field
              name="email"
              validators={{
                onChange: ({ value }) => (value.trim() ? undefined : "Email is required"),
              }}
            >
              {(field) => (
                <div className="flex flex-col gap-field">
                  <Label htmlFor={field.name}>Email</Label>
                  <Input
                    id={field.name}
                    type="email"
                    autoComplete="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                  {field.state.meta.isTouched && field.state.meta.errors[0] ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>
            <form.Field
              name="password"
              validators={{ onChange: ({ value }) => (value ? undefined : "Password is required") }}
            >
              {(field) => (
                <div className="flex flex-col gap-field">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={field.name}>Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id={field.name}
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                  {field.state.meta.isTouched && field.state.meta.errors[0] ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>
            <Turnstile key={captchaKey} onToken={setCaptchaToken} />
            <FormError>{error}</FormError>
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <>
                  <Button
                    type="submit"
                    disabled={
                      !canSubmit ||
                      isSubmitting ||
                      passkeyBusy ||
                      (turnstileEnabled && !captchaToken)
                    }
                    className="w-full"
                  >
                    {isSubmitting ? "Signing in…" : "Log in"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting || passkeyBusy}
                    className="w-full"
                    onClick={signInWithPasskey}
                  >
                    {passkeyBusy ? "Checking..." : "Sign in with passkey"}
                  </Button>
                </>
              )}
            </form.Subscribe>
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

function isEmailVerificationError(error: { message?: string; status?: number; code?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.status === 403 || error.code === "EMAIL_NOT_VERIFIED" || message.includes("verified")
  );
}
