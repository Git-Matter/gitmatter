import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { api } from "@/lib/data/api";
import { useSession } from "@/lib/auth/auth-client";

export function OrganizationCard() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const { data: tenant } = useQuery({ queryKey: ["tenant"], queryFn: () => api.getTenant() });
  const { data: members = [] } = useQuery({
    queryKey: ["tenant-members"],
    queryFn: () => api.listTenantMembers(),
  });
  const { data: invites = [], isError } = useQuery({
    queryKey: ["invites"],
    queryFn: () => api.listInvites(),
    retry: false,
  });
  const [email, setEmail] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["invites"] });

  const create = useMutation({
    mutationFn: () => api.createInvite(email.trim()),
    onSuccess: (inv) => {
      setEmail("");
      // With a real email provider the server emails the link and omits the token.
      setFresh("token" in inv ? inv.token : null);
      void invalidate();
      toast.success("Invite created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeInvite(id),
    onSuccess: () => invalidate(),
  });

  const isAdmin = !isError;
  const pending = invites.filter((invite) => !invite.acceptedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack">
        <p className="text-sm text-muted-foreground">
          {tenant ? tenant.name : "Your organization"}. Matters, reviews, and workflows can only be
          shared with people in this organization.
        </p>

        <div className="flex flex-col gap-2">
          <Label>Members{members.length > 0 ? ` (${members.length})` : ""}</Label>
          <ul className="flex flex-col divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar size="sm">
                    <AvatarFallback>{(m.name || m.email).slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {m.name || m.email}
                      {m.id === session?.user.id && (
                        <span className="text-muted-foreground"> (You)</span>
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                  </div>
                </div>
                {m.role && (
                  <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                )}
              </li>
            ))}
            {!members.length && (
              <li className="py-2 text-sm text-muted-foreground">No members yet.</li>
            )}
          </ul>
        </div>

        {isAdmin ? (
          <>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) create.mutate();
              }}
            >
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="invite-email">Invite a teammate</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@firm.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={create.isPending || !email.trim()}>
                {create.isPending ? "Inviting..." : "Invite"}
              </Button>
            </form>

            {fresh && (
              <div className="rounded-md border border-bronze/40 bg-bronze-tint p-3 text-sm">
                <p className="font-medium">
                  Share this signup link - they join your organization on sign-up:
                </p>
                <CodeBlock>
                  {typeof window !== "undefined" ? window.location.origin : ""}/signup?invite=
                  {fresh}
                </CodeBlock>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>Pending invites</Label>
              <ul className="flex flex-col gap-1.5 text-sm">
                {pending.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between border-b pb-1.5">
                    <span>
                      {invite.email}{" "}
                      <span className="text-muted-foreground capitalize">· {invite.role}</span>
                    </span>
                    <Button size="xs" variant="ghost" onClick={() => revoke.mutate(invite.id)}>
                      Revoke
                    </Button>
                  </li>
                ))}
                {!pending.length && <li className="text-muted-foreground">No pending invites.</li>}
              </ul>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only organization admins can invite teammates.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <code className="mt-1 block rounded bg-muted p-2 text-xs break-all whitespace-pre-wrap">
      {children}
    </code>
  );
}
