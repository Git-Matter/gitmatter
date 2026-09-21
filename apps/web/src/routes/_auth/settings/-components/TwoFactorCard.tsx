import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ShieldCheckIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { twoFactor } from "@/lib/auth/auth-client";

interface Enrollment {
  totpURI: string;
  backupCodes: string[];
}

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [replacementCodes, setReplacementCodes] = useState<string[] | null>(null);

  const enable = useMutation({
    mutationFn: async () => {
      const { data, error } = await twoFactor.enable({ password, method: "totp" });
      if (error) throw new Error(error.message ?? "Could not start two-factor setup");
      if (data?.method !== "totp") throw new Error("Setup details were not returned");
      return { totpURI: data.totpURI, backupCodes: data.backupCodes };
    },
    onSuccess: (details) => {
      setEnrollment(details);
      toast.success("Authenticator created. Verify a code to finish.");
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const verify = useMutation({
    mutationFn: async () => {
      const { error } = await twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
      if (error) throw new Error(error.message ?? "The verification code was not accepted");
    },
    onSuccess: async () => {
      setPassword("");
      setCode("");
      setEnrollment(null);
      await router.invalidate();
      toast.success("Two-factor authentication enabled");
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const disable = useMutation({
    mutationFn: async () => {
      const { error } = await twoFactor.disable({ password });
      if (error) throw new Error(error.message ?? "Could not disable two-factor authentication");
    },
    onSuccess: async () => {
      setPassword("");
      setReplacementCodes(null);
      await router.invalidate();
      toast.success("Two-factor authentication disabled");
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const { data, error } = await twoFactor.generateBackupCodes({ password });
      if (error) throw new Error(error.message ?? "Could not regenerate backup codes");
      if (!data?.backupCodes) throw new Error("Backup codes were not returned");
      return data.backupCodes;
    },
    onSuccess: (codes) => {
      setPassword("");
      setReplacementCodes(codes);
      toast.success("Previous backup codes are now invalid");
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const busy = enable.isPending || verify.isPending || disable.isPending || regenerate.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle>Two-factor authentication</CardTitle>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {enabled ? "Enabled" : "Optional"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <p className="text-sm text-muted-foreground">
          Use an authenticator app for a second code after signing in with your password.
        </p>

        {!enabled && !enrollment ? (
          <div className="flex items-end gap-2">
            <PasswordField value={password} onChange={setPassword} id="mfa-enable-password" />
            <Button onClick={() => enable.mutate()} disabled={busy || !password}>
              {enable.isPending ? "Starting..." : "Enable"}
            </Button>
          </div>
        ) : null}

        {enrollment ? (
          <div className="flex flex-col gap-5 border-t pt-5">
            <div className="grid gap-4 sm:grid-cols-[9rem_1fr] sm:items-center">
              <div className="rounded-lg bg-white p-3 shadow-sm">
                <QRCodeSVG
                  value={enrollment.totpURI}
                  className="h-auto w-full"
                  title="Authenticator QR code"
                />
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium">Scan this code with your authenticator app.</p>
                <p className="text-muted-foreground">If scanning fails, enter this setup key:</p>
                <code className="block rounded-md bg-muted px-3 py-2 text-xs break-all">
                  {secretFrom(enrollment.totpURI)}
                </code>
              </div>
            </div>
            <BackupCodes codes={enrollment.backupCodes} />
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="mfa-verification-code">Authenticator code</Label>
                <Input
                  id="mfa-verification-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={8}
                />
              </div>
              <Button
                onClick={() => verify.mutate()}
                disabled={busy || code.replace(/\s/g, "").length < 6}
              >
                {verify.isPending ? "Verifying..." : "Verify and enable"}
              </Button>
            </div>
          </div>
        ) : null}

        {enabled ? (
          <div className="flex flex-col gap-4 border-t pt-5">
            <PasswordField value={password} onChange={setPassword} id="mfa-manage-password" />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => regenerate.mutate()}
                disabled={busy || !password}
              >
                {regenerate.isPending ? "Generating..." : "New backup codes"}
              </Button>
              <Button
                variant="outline"
                onClick={() => disable.mutate()}
                disabled={busy || !password}
              >
                {disable.isPending ? "Disabling..." : "Disable"}
              </Button>
            </div>
            {replacementCodes ? <BackupCodes codes={replacementCodes} /> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PasswordField({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <Label htmlFor={id}>Current password</Label>
      <Input
        id={id}
        type="password"
        autoComplete="current-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success("Backup codes copied");
    } catch {
      toast.error("Could not copy backup codes");
    }
  }

  return (
    <div className="rounded-lg border bg-muted/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Save these backup codes now</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Each code works once. Store them somewhere separate from your authenticator.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void copyCodes()}>
          Copy
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm">
        {codes.map((backupCode) => (
          <code key={backupCode}>{backupCode}</code>
        ))}
      </div>
    </div>
  );
}

function secretFrom(totpURI: string): string {
  try {
    return new URL(totpURI).searchParams.get("secret") ?? totpURI;
  } catch {
    return totpURI;
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}
