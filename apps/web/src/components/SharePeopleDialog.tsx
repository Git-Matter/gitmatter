import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  const { data: people = [] } = useQuery({
    queryKey: source.queryKey,
    queryFn: source.list,
    enabled: open,
  });

  // Org directory for the picker — only the people not already on the list.
  const { data: members = [] } = useQuery({
    queryKey: ["tenant-members"],
    queryFn: () => api.listTenantMembers(),
    enabled: open && source.canManage,
  });
  const existing = new Set(people.map((p) => p.email.toLowerCase()));
  const candidates = members.filter((m) => !existing.has(m.email.toLowerCase()));

  const invalidate = () => qc.invalidateQueries({ queryKey: source.queryKey });

  const add = useMutation({
    mutationFn: () => source.addByEmail(email.trim(), role),
    onSuccess: () => {
      setEmail("");
      void invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add"),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => source.remove(userId),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
            {source.title} <span className="text-border">›</span>{" "}
            <span className="text-foreground">People</span>
          </DialogTitle>
        </DialogHeader>

        {source.canManage && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) add.mutate();
            }}
          >
            {/* Pick a teammate from the organization directory. */}
            <Select value={email} onValueChange={(v) => setEmail(v ?? "")}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Add a teammate…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {candidates.length === 0 && (
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
            <Select value={role} onValueChange={(v) => setRole(v as MatterRole)}>
              <SelectTrigger className="w-[130px]">
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
              disabled={add.isPending || !email.trim()}
            >
              <UserPlus className="size-4" />
            </Button>
          </form>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">People with Access</p>
          <ul className="flex flex-col divide-y divide-border">
            {people.map((m) => {
              const removable = source.canManage && (source.canRemove?.(m) ?? true);
              return (
                <li key={m.userId} className="flex items-center justify-between py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background">
                      {(m.name || m.email).slice(0, 1).toUpperCase()}
                    </div>
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
                    <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                    {removable && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Remove person"
                        aria-label="Remove person"
                        onClick={() => remove.mutate(m.userId)}
                        disabled={remove.isPending}
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
            {people.length} {people.length === 1 ? "person" : "people"} with access.
          </p>
        </div>
      </DialogContent>
    </Dialog>
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
