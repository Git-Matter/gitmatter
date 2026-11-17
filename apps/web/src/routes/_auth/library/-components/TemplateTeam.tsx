import { captureActionOrigin, notifySuccess } from "@/lib/feedback";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TemplateView } from "@workspace/contracts";
import { api } from "@/lib/data/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { isTemplateConflict, refreshTemplateQueries, templateQueryKey } from "./template-ui";

export function TemplateTeam({
  item,
  stale,
  onUpdated,
}: {
  item: TemplateView;
  stale: boolean;
  onUpdated: () => void;
}) {
  const client = useQueryClient();
  const people = useQuery({
    queryKey: ["tenant-members"],
    queryFn: api.listTenantMembers,
    enabled: item.canManageMembers,
  });
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"editor" | "reviewer">("editor");
  const [ownerId, setOwnerId] = useState(item.ownerId ?? "");
  const mutation = useMutation({
    onMutate: () => captureActionOrigin(),
    mutationFn: (input: {
      action: "set_member" | "remove_member" | "assign";
      userId?: string;
      role?: "editor" | "reviewer";
      ownerId?: string;
    }) =>
      api.templateAction(item.id, {
        expectedHead: item.headCommitId,
        ...input,
        message:
          input.action === "assign"
            ? "Reassigned template ownership"
            : input.action === "remove_member"
              ? "Removed template team access"
              : `Granted template ${input.role} access`,
      }),
    onSuccess: async (_data, _variables, origin) => {
      await client.invalidateQueries({ queryKey: templateQueryKey });
      notifySuccess("Template team updated", origin);
      onUpdated();
    },
    onError: async (error) => {
      if (isTemplateConflict(error)) await refreshTemplateQueries(client, item.id);
    },
  });
  const selectedPerson = people.data?.find((person) => person.id === userId);
  return (
    <details className="rounded-xl bg-muted/40 p-4">
      <summary className="cursor-pointer font-medium">Template team</summary>
      <div className="mt-4 flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          Editors prepare revisions. Reviewers can be assigned approval without becoming workspace
          admins.
        </p>
        <ul className="flex flex-col gap-3 text-sm">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>{item.ownerName ?? "Owner needed"}</span>
            <span className="text-muted-foreground">Owner</span>
          </li>
          {item.members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2">
              <span>{member.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {member.role === "reviewer" ? "Reviewer" : "Editor"}
                </span>
                {item.canManageMembers && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={stale || mutation.isPending}
                    onClick={() =>
                      mutation.mutate({ action: "remove_member", userId: member.userId })
                    }
                    aria-label={`Remove ${member.name} from template team`}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {item.canManageMembers && (
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="template-member">Workspace member</FieldLabel>
                <Select
                  value={userId}
                  onValueChange={(value) => setUserId(value ?? "")}
                  disabled={stale || mutation.isPending}
                >
                  <SelectTrigger id="template-member" className="w-full">
                    <SelectValue>{selectedPerson?.name ?? "Choose a member"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {people.data
                        ?.filter((person) => person.id !== item.ownerId)
                        .map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="template-member-role">Access</FieldLabel>
                <Select
                  value={role}
                  onValueChange={(value) => {
                    if (value) setRole(value as "editor" | "reviewer");
                  }}
                  disabled={stale || mutation.isPending}
                >
                  <SelectTrigger id="template-member-role" className="w-full">
                    <SelectValue>{role === "editor" ? "Editor" : "Reviewer"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="reviewer">Reviewer</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Button
                variant="outline"
                disabled={stale || mutation.isPending || !userId}
                onClick={() => mutation.mutate({ action: "set_member", userId, role })}
              >
                {mutation.isPending && <Spinner data-icon="inline-start" />}Set access
              </Button>
            </div>
            <Field>
              <FieldLabel htmlFor="template-owner">Responsible owner</FieldLabel>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Select
                  value={ownerId}
                  onValueChange={(value) => setOwnerId(value ?? "")}
                  disabled={stale || mutation.isPending}
                >
                  <SelectTrigger id="template-owner" className="w-full">
                    <SelectValue>
                      {people.data?.find((person) => person.id === ownerId)?.name ??
                        item.ownerName ??
                        "Choose owner"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {people.data?.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={stale || mutation.isPending || !ownerId || ownerId === item.ownerId}
                  onClick={() => mutation.mutate({ action: "assign", ownerId })}
                >
                  Assign owner
                </Button>
              </div>
              <FieldDescription>
                Workspace admins retain oversight. Team access and ownership changes are recorded in
                history.
              </FieldDescription>
            </Field>
          </FieldGroup>
        )}
        {people.isError && (
          <p role="alert" className="text-sm text-destructive">
            Workspace members could not be loaded.
          </p>
        )}
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertTitle>Access was not changed</AlertTitle>
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        )}
      </div>
    </details>
  );
}
