import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { api, type FirmUser, type Matter, type MatterMember, type MatterRole } from "../lib/api";
import { useSession } from "../lib/auth-client";
import { useMatters } from "../lib/matters-context";

export const Route = createFileRoute("/matters/$id")({ component: MatterDetail });

function MatterDetail() {
  const { id } = useParams({ from: "/matters/$id" });
  const { data: session } = useSession();
  const { refresh: refreshMatters } = useMatters();
  const [matter, setMatter] = useState<Matter | null>(null);
  const [members, setMembers] = useState<MatterMember[]>([]);
  const [notFound, setNotFound] = useState(false);

  const load = () => {
    api
      .getMatter(id)
      .then(setMatter)
      .catch(() => setNotFound(true));
    api
      .listMembers(id)
      .then(setMembers)
      .catch(() => {});
  };
  useEffect(load, [id]);

  if (notFound)
    return (
      <p className="text-muted-foreground">
        Matter not found, or you don't have access.{" "}
        <Link to="/matters" className="underline">
          Back to matters
        </Link>
      </p>
    );
  if (!matter) return null;

  const myRole = members.find((m) => m.userId === session?.user.id)?.role;
  const isOwner = myRole === "owner";

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title={matter.name}
        description={matter.practiceArea ?? undefined}
        action={
          isOwner && matter.status === "active" ? (
            <Button
              variant="outline"
              onClick={async () => {
                await api.closeMatter(id);
                toast.success("Matter closed");
                load();
                refreshMatters();
              }}
            >
              Close matter
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {matter.matterNumber && <Badge variant="secondary">No. {matter.matterNumber}</Badge>}
        <Badge variant="outline" className="capitalize">
          {matter.status}
        </Badge>
        {matter.conflictCleared ? (
          <Badge variant="secondary">Conflicts cleared</Badge>
        ) : (
          <Badge variant="outline" className="border-amber-500/50 text-amber-700">
            Conflicts pending
          </Badge>
        )}
      </div>

      <ConflictsCard matter={matter} canEdit={isOwner} onChange={load} />
      <TeamCard
        matterId={id}
        members={members}
        canEdit={isOwner}
        selfId={session?.user.id}
        onChange={load}
      />
    </div>
  );
}

function ConflictsCard({
  matter,
  canEdit,
  onChange,
}: {
  matter: Matter;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [notes, setNotes] = useState(matter.conflictNotes ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conflicts</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack text-sm">
        {matter.adverseParties?.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">Adverse parties:</span>
            {matter.adverseParties.map((p) => (
              <Badge key={p} variant="outline" className="font-normal">
                {p}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No adverse parties recorded.</p>
        )}

        {matter.conflictCleared ? (
          <p className="text-muted-foreground">
            Cleared{matter.conflictNotes ? ` — ${matter.conflictNotes}` : ""}.
          </p>
        ) : canEdit ? (
          <div className="flex flex-col gap-field">
            <Label>Clearance notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reviewed against firm matters; no conflict."
            />
            <Button
              className="mt-1 self-start"
              onClick={async () => {
                await api.clearConflicts(matter.id, notes.trim() || undefined);
                toast.success("Conflicts cleared");
                onChange();
              }}
            >
              Mark cleared
            </Button>
          </div>
        ) : (
          <p className="text-amber-700">Conflicts not yet cleared by an owner.</p>
        )}
      </CardContent>
    </Card>
  );
}

const ROLES: MatterRole[] = ["owner", "editor", "viewer"];

function TeamCard({
  matterId,
  members,
  canEdit,
  selfId,
  onChange,
}: {
  matterId: string;
  members: MatterMember[];
  canEdit: boolean;
  selfId?: string;
  onChange: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FirmUser[]>([]);
  const [role, setRole] = useState<MatterRole>("editor");

  useEffect(() => {
    const q = query.trim();
    if (!q) return setResults([]);
    const t = setTimeout(() => {
      api
        .searchUsers(q)
        .then(setResults)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const memberIds = new Set(members.map((m) => m.userId));

  async function add(userId: string) {
    try {
      await api.addMember(matterId, userId, role);
      setQuery("");
      setResults([]);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function remove(userId: string) {
    try {
      await api.removeMember(matterId, userId);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack">
        <ul className="flex flex-col divide-y divide-border text-sm">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between py-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{m.name || m.email}</span>
                <span className="truncate text-xs text-muted-foreground">{m.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {m.role}
                </Badge>
                {canEdit && m.userId !== selfId && (
                  <Button size="xs" variant="ghost" onClick={() => remove(m.userId)}>
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {canEdit && (
          <div className="flex flex-col gap-field border-t border-border pt-stack">
            <Label>Add a colleague</Label>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email"
              />
              <select
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as MatterRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">
                    {r}
                  </option>
                ))}
              </select>
            </div>
            {results.length > 0 && (
              <ul className="flex flex-col rounded-md border border-border">
                {results.map((u) => {
                  const already = memberIds.has(u.id);
                  return (
                    <li
                      key={u.id}
                      className="flex items-center justify-between px-3 py-2 text-sm not-last:border-b"
                    >
                      <span className="truncate">
                        {u.name || u.email}{" "}
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </span>
                      <Button size="xs" disabled={already} onClick={() => add(u.id)}>
                        {already ? "Added" : "Add"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
