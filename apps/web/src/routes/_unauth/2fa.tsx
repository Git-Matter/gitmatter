import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form/FormError";
import { twoFactor } from "@/lib/auth/auth-client";
import { AuthShell } from "./-components/AuthShell";

export const Route = createFileRoute("/_unauth/2fa")({
  head: () => ({
    meta: [
      { title: "Two-factor verification · gitmatter" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: TwoFactorVerification,
});

function TwoFactorVerification() {
  const { next } = Route.useSearch();
  const [method, setMethod] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    const result =
      method === "totp"
        ? await twoFactor.verifyTotp({ code: code.replace(/\s/g, ""), trustDevice: false })
        : await twoFactor.verifyBackupCode({ code: code.trim(), trustDevice: false });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "The code was not accepted");
      return;
    }
    window.location.href = next && next.startsWith("/") ? next : "/assistant";
  }

  return (
    <AuthShell title="Verify it’s you" subtitle="Enter the second factor for your account.">
      <Card>
        <CardContent className="flex flex-col gap-stack pt-6">
          <div className="flex justify-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground">
              <ShieldCheckIcon className="size-5" aria-hidden="true" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="two-factor-code">
              {method === "totp" ? "Authenticator code" : "Backup code"}
            </Label>
            <Input
              id="two-factor-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode={method === "totp" ? "numeric" : "text"}
              autoComplete="one-time-code"
              autoFocus
              placeholder={method === "totp" ? "123456" : "Enter a backup code"}
              onKeyDown={(event) => {
                if (event.key === "Enter" && code.trim() && !busy) void verify();
              }}
            />
          </div>
          <FormError>{error}</FormError>
          <Button className="w-full" disabled={busy || !code.trim()} onClick={() => void verify()}>
            {busy ? "Verifying..." : "Continue"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setMethod((current) => (current === "totp" ? "backup" : "totp"));
              setCode("");
              setError(null);
            }}
          >
            {method === "totp" ? "Use a backup code" : "Use authenticator code"}
          </Button>
          <Link
            to="/login"
            search={next ? { next } : {}}
            className="text-center text-sm text-muted-foreground underline underline-offset-4"
          >
            Back to login
          </Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
