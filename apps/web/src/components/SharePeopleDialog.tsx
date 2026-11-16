import { FieldDescription } from "@/components/ui/field";
import { captureActionOrigin, notifySuccess, type ActionOrigin } from "@/lib/feedback";
import { useDraftExit } from "@/lib/hooks/useDraftExit";
import { SnapshotNotice } from "@/components/SnapshotNotice";
import { FormFeedback } from "@/components/FormFeedback";
import { readableSnapshot, snapshotIsCurrent } from "@/lib/data/snapshot-refresh";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, UserPlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type MatterRole, type SharePerson } from "@/lib/data/api";
import { useSession } from "@/lib/auth/auth-client";

/**
 * A data source plugs an entity (matter / document / review) into the shared
 * "People with access" dialog. The dialog itself is entity-agnostic.
 */
export type ShareSource = {
  title: string;
  canManage: boolean;
  roles: MatterRole[];
  queryKey: unknown[];
  list: () => Promise<SharePerson[]>;
  addByEmail: (email: string, role: MatterRole) => Promise<unknown>;
  remove: (userId: string) => Promise<unknown>;
  /** Whether a person can be removed (e.g. the intrinsic owner cannot). */
  canRemove?: (p: SharePerson) => boolean;
};

export function SharePeopleDialog({
  source,
  open,
  onOpenChange,
}: {
  source: ShareSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MatterRole>(source.roles[0] ?? "editor");

  const [result, setResult] = useState<string | null>(null);
  const peopleQuery = useQuery({
    queryKey: source.queryKey,
    queryFn: source.list,
    enabled: open,
    retry: false,
  });
  const directoryQuery = useQuery({
    queryKey: ["tenant-members"],
    queryFn: () => api.listTenantMembers(),
    enabled: open && source.canManage,
    retry: false,
  });
  const people = readableSnapshot(peopleQuery);
  const members = readableSnapshot(directoryQuery);
  const teamCurrent = snapshotIsCurrent(peopleQuery);
  const directoryCurrent = snapshotIsCurrent(directoryQuery);
  const readyToAdd = source.canManage && teamCurrent && directoryCurrent;
  const hiddenTeam = !!peopleQuery.error && people === undefined;
  const hiddenDirectory = !!directoryQuery.error && members === undefined;
  const existing = new Set((people ?? []).map((person) => person.email.toLowerCase()));
  const candidates = (members ?? []).filter((member) => !existing.has(member.email.toLowerCase()));
  const candidateSelected = candidates.some((member) => member.email === email);

  const invalidate = () => qc.invalidateQueries({ queryKey: source.queryKey });
  const add = useMutation({
    mutationFn: (input: { email: string; role: MatterRole; origin: ActionOrigin }) => {
      if (!readyToAdd || !candidates.some((member) => member.email === input.email))
        throw new Error(
          "Refresh team access and the organization directory before adding a person."
        );
      return source.addByEmail(input.email, input.role);
    },
    onSuccess: async (_data, input) => {
      setEmail("");
      setResult("Person added to the team");
      notifySuccess("Person added to the team", input.origin);
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (input: { userId: string; origin: ActionOrigin }) => {
      if (!source.canManage || !teamCurrent)
        throw new Error("Refresh team access before removing a person.");
      return source.remove(input.userId);
    },
    onSuccess: async (_data, input) => {
      setResult("Person removed from the team");
      notifySuccess("Person removed from the team", input.origin);
      await invalidate();
    },
  });
  function resetFeedback() {
    setResult(null);
    add.reset();
    remove.reset();
  }
  const busy = add.isPending || remove.isPending;
  const showingPreviousTeam = !teamCurrent || busy;
  const identity = JSON.stringify(source.queryKey);
  useEffect(() => {
    if (busy) return;
    setEmail("");
    resetFeedback();
  }, [open, identity]);
  const exit = useDraftExit({
    dirty: open && !!email,
    saving: open && busy,
    pendingTitle: "Sharing action in progress",
    pendingDescription:
      "Wait for the access change to finish before leaving. Closing does not cancel a sent request.",
    discard: () => setEmail(""),
  });
  return (
    <>
      {exit.guard}
      <Dialog
        open={open}
        onOpenChange={(next, details) => {
          if (next) onOpenChange(true);
          else if (!exit.requestClose(() => onOpenChange(false))) details.cancel();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
              {source.title} <span className="text-border">›</span>{" "}
              <span className="text-foreground">People</span>
            </DialogTitle>
          </DialogHeader>

          <SnapshotNotice query={peopleQuery} label="Team access" />
          {peopleQuery.isPending && <p role="status">Loading team access…</p>}
          {source.canManage && (
            <SnapshotNotice query={directoryQuery} label="Organization directory" />
          )}
          {source.canManage && directoryQuery.isPending && (
            <p role="status">Loading organization directory…</p>
          )}
          <FormFeedback error={add.error || remove.error} title="Team access was not changed" />
          <div role="status" aria-live="polite" aria-atomic="true">
            {result && (
              <Alert key={result} role="presentation">
                <CircleCheck aria-hidden="true" />
                <AlertTitle>{result}</AlertTitle>
                {busy && (
                  <AlertDescription>Refreshing team access after your change…</AlertDescription>
                )}
              </Alert>
            )}
            {!result && busy && <p>Updating team access…</p>}
          </div>
          {source.canManage && !hiddenTeam && !hiddenDirectory && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (readyToAdd && candidateSelected && !busy) {
                  resetFeedback();
                  add.mutate({ email: email.trim(), role, origin: captureActionOrigin() });
                }
              }}
            >
              {/* Pick a teammate from the organization directory. */}
              <Select
                disabled={!readyToAdd || busy}
                value={email}
                onValueChange={(v) => setEmail(v ?? "")}
              >
                <SelectTrigger
                  className="flex-1"
                  aria-label="Organization teammate"
                  aria-describedby="share-add-hint"
                >
                  <SelectValue placeholder="Add a teammate…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {readyToAdd && candidates.length === 0 && (
                      <SelectItem value="" disabled>
                        Everyone already has access
                      </SelectItem>
                    )}
                    {candidates.map((m) => (
                      <SelectItem key={m.id} value={m.email}>
                        {m.name || m.email}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                disabled={!readyToAdd || busy}
                value={role}
                onValueChange={(v) => setRole(v as MatterRole)}
              >
                <SelectTrigger className="w-[130px]" aria-label="Team role">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {source.roles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                type="submit"
                size="icon"
                title="Add person"
                aria-label="Add person"
                disabled={busy || !readyToAdd || !candidateSelected}
                aria-describedby="share-add-hint"
              >
                <UserPlus className="size-4" />
              </Button>
            </form>
          )}
          {source.canManage && (
            <FieldDescription id="share-add-hint">
              {busy
                ? "Wait for the access change and team refresh before choosing another person."
                : !readyToAdd
                  ? "Confirm current team access and the organization directory before adding a person."
                  : "Choose an organization member and their role to enable Add person. People already on the team are excluded."}
            </FieldDescription>
          )}

          {people !== undefined && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {showingPreviousTeam ? "Last loaded team access" : "People with Access"}
              </p>
              <ul className="flex flex-col divide-y divide-border">
                {people.map((m) => {
                  const removable = source.canManage && (source.canRemove?.(m) ?? true);
                  return (
                    <li key={m.userId} className="flex items-center justify-between py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar size="sm">
                          <AvatarFallback>
                            {(m.name || m.email).slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm">
                            {m.name || m.email}
                            {m.userId === session?.user.id && (
                              <span className="text-muted-foreground"> (You)</span>
                            )}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {m.role}
                        </Badge>
                        {removable && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            title="Remove person"
                            aria-label="Remove person"
                            onClick={() => {
                              resetFeedback();
                              remove.mutate({ userId: m.userId, origin: captureActionOrigin() });
                            }}
                            disabled={busy || !teamCurrent}
                          >
                            <X className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-sm">
                {showingPreviousTeam ? "Last loaded: " : ""}
                {people.length} {people.length === 1 ? "person" : "people"}
                {showingPreviousTeam ? ". Refreshing to confirm current access." : " with access."}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Adapters: one per shareable entity ----

const ARTIFACT_ROLES: MatterRole[] = ["viewer", "editor", "owner"];

export function matterShareSource(
  matterId: string,
  matterName: string,
  canManage: boolean
): ShareSource {
  return {
    title: matterName,
    canManage,
    roles: ["editor", "viewer", "owner"],
    queryKey: ["matter-people", matterId],
    list: () => api.getMatterPeople(matterId),
    addByEmail: (email, role) => api.addMemberByEmail(matterId, email, role),
    remove: (userId) => api.removeMember(matterId, userId),
    // Matter owners are managed via the server's last-owner guard.
    canRemove: (p) => p.role !== "owner",
  };
}

export function clientShareSource(
  clientId: string,
  clientName: string,
  canManage: boolean
): ShareSource {
  return {
    title: clientName,
    canManage,
    roles: ["editor", "viewer", "owner"],
    queryKey: ["client-people", clientId],
    list: () => api.getClientPeople(clientId),
    addByEmail: (email, role) => api.addClientMemberByEmail(clientId, email, role),
    remove: (userId) => api.removeClientMember(clientId, userId),
    // Client owners are managed via the server's last-owner guard.
    canRemove: (p) => p.role !== "owner",
  };
}

export function documentShareSource(id: string, title: string, canManage: boolean): ShareSource {
  return {
    title,
    canManage,
    roles: ARTIFACT_ROLES,
    queryKey: ["artifact-shares", "document", id],
    list: () => api.listArtifactShares("document", id),
    addByEmail: (email, role) => api.addArtifactShareByEmail("document", id, email, role),
    remove: (userId) => api.removeArtifactShare("document", id, userId),
    // The intrinsic owner (null addedAt) can't be removed; co-owners can.
    canRemove: (p) => p.addedAt !== null,
  };
}

export function reviewShareSource(id: string, title: string, canManage: boolean): ShareSource {
  return {
    title,
    canManage,
    roles: ARTIFACT_ROLES,
    queryKey: ["artifact-shares", "review", id],
    list: () => api.listArtifactShares("review", id),
    addByEmail: (email, role) => api.addArtifactShareByEmail("review", id, email, role),
    remove: (userId) => api.removeArtifactShare("review", id, userId),
    canRemove: (p) => p.addedAt !== null,
  };
}
