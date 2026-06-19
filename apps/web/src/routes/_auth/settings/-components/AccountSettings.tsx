import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeEmail, changePassword, deleteUser, updateUser } from "@/lib/auth/auth-client";
import type { ServerSession } from "@/lib/auth/session";

type Session = NonNullable<ServerSession>;

export function AccountSettings({ session }: { session: Session }) {
  return (
    <>
      <ProfileCard session={session} />
      <EmailCard session={session} />
      <PasswordCard />
      <AppearanceCard />
      <DangerZoneCard />
    </>
  );
}

function ProfileCard({ session }: { session: Session }) {
  const router = useRouter();
  const [name, setName] = useState(session.user.name ?? "");
  const [image, setImage] = useState(session.user.image ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await updateUser({ name: name.trim(), image: image.trim() || undefined });
      if (error) throw new Error(error.message ?? "Failed to update profile");
    },
    onSuccess: async () => {
      await router.invalidate();
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-name">Display name</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-image">Avatar URL</Label>
          <Input
            id="profile-image"
            type="url"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <Button
          className="self-start"
          onClick={() => save.mutate()}
          disabled={save.isPending || !name.trim()}
        >
          {save.isPending ? "Saving..." : "Save profile"}
        </Button>
      </CardContent>
    </Card>
  );
}

function EmailCard({ session }: { session: Session }) {
  const router = useRouter();
  const [email, setEmail] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await changeEmail({ newEmail: email.trim() });
      if (error) throw new Error(error.message ?? "Failed to change email");
    },
    onSuccess: async () => {
      setEmail("");
      await router.invalidate();
      toast.success("Email updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <p className="text-sm text-muted-foreground">
          Current: <span className="font-medium text-foreground">{session.user.email}</span>
        </p>
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="new-email">New email</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@firm.com"
            />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !email.trim()}>
            {save.isPending ? "Saving..." : "Update"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const save = useMutation({
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
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <Button
          className="self-start"
          onClick={() => save.mutate()}
          disabled={save.isPending || !current || !next}
        >
          {save.isPending ? "Saving..." : "Change password"}
        </Button>
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
              variant={theme === t.value ? "default" : "outline"}
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
      const { error } = await deleteUser({ password });
      if (error) throw new Error(error.message ?? "Failed to delete account");
    },
    onSuccess: () => {
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
