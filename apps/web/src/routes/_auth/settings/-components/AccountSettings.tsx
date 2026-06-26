import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangleIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  authClient,
  changePassword,
  deleteUser,
  updateUser,
  useListPasskeys,
} from "@/lib/auth/auth-client";
import type { ServerSession } from "@/lib/auth/session";

type Session = NonNullable<ServerSession>;

export function AccountSettings({ session }: { session: Session }) {
  return (
    <>
      <AccountCard session={session} />
      <PasskeysCard />
      <AppearanceCard />
      <DangerZoneCard />
    </>
  );
}

function AccountCard({ session }: { session: Session }) {
  const router = useRouter();
  const [name, setName] = useState(session.user.name ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const initials = initialsFor(session.user.name ?? session.user.email);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await updateUser({ name: name.trim() });
      if (error) throw new Error(error.message ?? "Failed to update profile");
    },
    onSuccess: async () => {
      await router.invalidate();
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const savePassword = useMutation({
    mutationFn: async () => {
      const { error } = await changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (error) throw new Error(error.message ?? "Failed to change password");
    },
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast.success("Password changed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Account</CardTitle>
        <Button
          size="sm"
          onClick={() => saveProfile.mutate()}
          disabled={saveProfile.isPending || !name.trim()}
        >
          {saveProfile.isPending ? "Saving..." : "Save"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-[5rem_1fr] sm:items-start">
          <Avatar className="size-16 text-base" aria-hidden="true">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid gap-1.5 sm:grid-cols-[5rem_1fr] sm:items-center sm:gap-4">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>

            <div className="grid gap-1.5 sm:grid-cols-[5rem_1fr] sm:items-center sm:gap-4">
              <Label>Email</Label>
              <p className="min-w-0 truncate text-sm font-medium text-foreground">
                {session.user.email}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-5">
          <p className="text-sm font-medium text-foreground">Password</p>
          <div className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-4">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-4">
            <Label htmlFor="new-password">New password</Label>
            <div className="flex gap-2">
              <Input
                id="new-password"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <Button
                onClick={() => savePassword.mutate()}
                disabled={savePassword.isPending || !current || !next}
              >
                {savePassword.isPending ? "Saving..." : "Change"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function initialsFor(value: string): string {
  const parts = value.trim().split(/\s+|@/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function PasskeysCard() {
  const passkeys = useListPasskeys();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
      if (error) throw new Error(error.message ?? "Failed to add passkey");
    },
    onSuccess: async () => {
      setName("");
      await passkeys.refetch();
      toast.success("Passkey added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rename = useMutation({
    mutationFn: async ({ id, nextName }: { id: string; nextName: string }) => {
      const { error } = await authClient.passkey.updatePasskey({ id, name: nextName });
      if (error) throw new Error(error.message ?? "Failed to rename passkey");
    },
    onSuccess: async () => {
      setEditingId(null);
      setEditingName("");
      await passkeys.refetch();
      toast.success("Passkey renamed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) throw new Error(error.message ?? "Failed to remove passkey");
    },
    onSuccess: async () => {
      await passkeys.refetch();
      toast.success("Passkey removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = passkeys.data ?? [];
  const busy = add.isPending || rename.isPending || remove.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRoundIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle>Passkeys</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <p className="text-sm text-muted-foreground">
          Use a device passkey to log in without typing your password.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="passkey-name">Name</Label>
            <Input
              id="passkey-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="MacBook Touch ID"
            />
          </div>
          <Button onClick={() => add.mutate()} disabled={busy}>
            {add.isPending ? "Adding..." : "Add"}
          </Button>
        </div>
        {passkeys.isPending ? (
          <p className="text-sm text-muted-foreground">Loading passkeys...</p>
        ) : passkeys.error ? (
          <p className="text-sm text-destructive">Could not load passkeys.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No passkeys added yet.</p>
        ) : (
          <div className="flex flex-col divide-y rounded-md border">
            {rows.map((passkey) => {
              const label = passkey.name?.trim() || "Passkey";
              const isEditing = editingId === passkey.id;
              return (
                <div
                  key={passkey.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <>
                        <p className="truncate text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          Added {new Date(passkey.createdAt).toLocaleDateString()}
                        </p>
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          rename.mutate({ id: passkey.id, nextName: editingName.trim() })
                        }
                        disabled={busy || !editingName.trim()}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setEditingName("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(passkey.id);
                          setEditingName(label);
                        }}
                        disabled={busy}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => remove.mutate(passkey.id)}
                        disabled={busy}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <p className="text-sm text-muted-foreground">Theme used across gitmatter.</p>
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => (
            <Button
              key={t.value}
              size="sm"
              variant={mounted && theme === t.value ? "default" : "outline"}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DangerZoneCard() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await deleteUser({ password, callbackURL: "/signup" });
      if (error) throw new Error(error.message ?? "Failed to delete account");
    },
    onSuccess: async () => {
      const { data: session } = await authClient.getSession();
      if (session) {
        setOpen(false);
        toast.success("Check your email to confirm account deletion.");
        return;
      }
      window.location.href = "/signup";
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card className="border-destructive/35 bg-[oklch(0.975_0.018_27)] shadow-[0_1px_2px_oklch(0.577_0.245_27.325_/_0.10)]">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-destructive/10 p-2 text-destructive ring-1 ring-destructive/20">
            <AlertTriangleIcon className="size-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <p className="text-sm font-medium text-destructive/85">Delete account permanently</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <p className="max-w-prose text-sm text-destructive/80">
          This removes your profile, settings, and access immediately. This action cannot be undone.
        </p>
        <Button variant="destructive" className="self-start" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently removes your account and cannot be undone. Enter your password to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-field">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-password">Password</Label>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => remove.mutate()}
                disabled={remove.isPending || !password}
              >
                {remove.isPending ? "Deleting..." : "Delete account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
