import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { practiceProfileSchema, type PracticeProfile } from "@workspace/contracts";
import { JURISDICTIONS } from "@workspace/registry";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { practiceApi } from "@/lib/data/practice-api";

export function PracticeProfileCard({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ["practice-profile", userId],
    queryFn: practiceApi.getProfile,
    refetchOnWindowFocus: false,
  });

  if (query.isPending)
    return <Skeleton className="h-80 w-full" aria-label="Loading practice preferences" />;
  if (query.isError)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load practice preferences.{" "}
          <button type="button" className="underline" onClick={() => void query.refetch()}>
            Try again
          </button>
          .
        </AlertDescription>
      </Alert>
    );

  return (
    <PracticeProfileForm
      key={JSON.stringify(query.data.profile)}
      userId={userId}
      profile={query.data.profile}
      canEdit={query.data.canEdit}
    />
  );
}

function PracticeProfileForm({
  userId,
  profile,
  canEdit,
}: {
  userId: string;
  profile: PracticeProfile;
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState(profile);
  const [validationError, setValidationError] = useState<string | null>(null);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: practiceApi.saveProfile,
    onSuccess: (result) => {
      qc.setQueryData(["practice-profile", userId], result);
      void qc.invalidateQueries({ queryKey: ["practice-profile"] });
      toast.success("Practice preferences saved");
    },
  });
  const update = <K extends keyof PracticeProfile>(key: K, value: PracticeProfile[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setValidationError(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your practice</CardTitle>
        <CardDescription>
          Set the context for guided work and the wording used in draft correspondence.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = practiceProfileSchema.safeParse(draft);
            if (!parsed.success) {
              setValidationError(
                parsed.error.issues[0]?.message ?? "Check your practice preferences."
              );
              return;
            }
            save.mutate(parsed.data);
          }}
        >
          {!canEdit && (
            <p className="text-sm text-muted-foreground">
              Your practice administrator can update these shared preferences.
            </p>
          )}
          <FieldSet disabled={!canEdit || save.isPending}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="practice-name">Practice name</FieldLabel>
                <Input
                  id="practice-name"
                  value={draft.displayName}
                  maxLength={160}
                  onChange={(event) => update("displayName", event.target.value)}
                  placeholder="Your practice name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="practice-jurisdiction">
                  Default jurisdiction for guided work
                </FieldLabel>
                <select
                  id="practice-jurisdiction"
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={draft.jurisdiction}
                  onChange={(event) =>
                    update("jurisdiction", event.target.value as PracticeProfile["jurisdiction"])
                  }
                >
                  {JURISDICTIONS.filter(
                    (item) => item.code === "AU" || item.code.startsWith("AU-")
                  ).map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <FieldDescription>
                  This provides legal context. It does not select document storage or establish
                  where AI processing occurs.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="practice-header">Correspondence header</FieldLabel>
                <Textarea
                  id="practice-header"
                  value={draft.correspondenceHeader}
                  maxLength={2000}
                  rows={4}
                  onChange={(event) => update("correspondenceHeader", event.target.value)}
                  placeholder="Practice name, address and contact details you want on draft letters"
                />
                <FieldDescription>
                  Plain text for your letterhead wording. Include only details you are authorised to
                  use.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="practice-signoff">Preferred sign-off</FieldLabel>
                <Textarea
                  id="practice-signoff"
                  value={draft.signOff}
                  maxLength={500}
                  rows={3}
                  onChange={(event) => update("signOff", event.target.value)}
                  placeholder="Kind regards, followed by your name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="practice-instructions">Correspondence preferences</FieldLabel>
                <Textarea
                  id="practice-instructions"
                  value={draft.instructions}
                  maxLength={3000}
                  rows={4}
                  onChange={(event) => update("instructions", event.target.value)}
                  placeholder="For example: use plain Australian English and short paragraphs."
                />
                <FieldDescription>
                  Keep client details and credentials out of these practice-wide preferences. You
                  will check each draft before use.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>
          {(validationError || save.isError) && (
            <Alert variant="destructive">
              <AlertDescription>
                {validationError ?? save.error?.message ?? "Could not save preferences."}
              </AlertDescription>
            </Alert>
          )}
          {canEdit && (
            <Button
              type="submit"
              className="self-start"
              disabled={save.isPending || JSON.stringify(draft) === JSON.stringify(profile)}
            >
              {save.isPending ? "Saving…" : "Save practice preferences"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
