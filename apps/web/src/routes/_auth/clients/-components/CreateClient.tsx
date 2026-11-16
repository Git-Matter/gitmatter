import { FieldDescription } from "@/components/ui/field";
import { captureActionOrigin, notifySuccess } from "@/lib/feedback";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDraftExit } from "@/lib/hooks/useDraftExit";
import { FormFeedback } from "@/components/FormFeedback";
import { useForm, useStore } from "@tanstack/react-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/data/api";
import { queryKeys } from "@/lib/data/queries";

export function CreateClient({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const createMutation = useMutation({
    onMutate: () => captureActionOrigin(),
    mutationFn: (d: { name: string; type: "organization" | "individual"; clientNumber?: string }) =>
      api.createClient(d),
    onSuccess: (_data, _variables, origin) => {
      exit.resolve();
      void qc.invalidateQueries({ queryKey: queryKeys.clients });
      notifySuccess("Client created", origin);
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const form = useForm({
    defaultValues: {
      name: "",
      type: "organization" as "organization" | "individual",
      clientNumber: "",
    },
    onSubmit: ({ value }) =>
      createMutation
        .mutateAsync({
          name: value.name.trim(),
          type: value.type,
          clientNumber: value.clientNumber.trim() || undefined,
        })
        .catch(() => {}),
  });

  const dirty = useStore(form.store, (state) => state.isDirty);
  const exit = useDraftExit({
    dirty,
    saving: createMutation.isPending,
    discard: () => form.reset(),
  });
  return (
    <Card>
      {exit.guard}
      <CardHeader>
        <CardTitle className="text-base">New client</CardTitle>
      </CardHeader>
      <CardContent>
        <FormFeedback error={createMutation.error} title="Client was not created" />
        <form
          className="flex flex-col gap-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldDescription id="client-create-hint">
            A client name is required to enable Create. Client number and notes are optional.
          </FieldDescription>
          <fieldset disabled={createMutation.isPending} className="flex min-w-0 flex-col gap-stack">
            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) => (value.trim() ? undefined : "Name is required"),
              }}
            >
              {(field) => (
                <div className="flex flex-col gap-field">
                  <Label htmlFor={field.name}>Name</Label>
                  <Input
                    id={field.name}
                    aria-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}
                    aria-describedby={
                      field.state.meta.isTouched && field.state.meta.errors.length
                        ? `${field.name}-error client-create-hint`
                        : "client-create-hint"
                    }
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Acme Corp"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors[0] && (
                    <p id={`${field.name}-error`} role="alert" className="text-xs text-destructive">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </div>
              )}
            </form.Field>

            <div className="grid grid-cols-2 gap-stack">
              <form.Field name="type">
                {(field) => (
                  <div className="flex flex-col gap-field">
                    <Label htmlFor={field.name}>Type</Label>
                    <NativeSelect
                      id={field.name}
                      value={field.state.value}
                      onChange={(e) =>
                        field.handleChange(e.target.value as "organization" | "individual")
                      }
                    >
                      <NativeSelectOption value="organization">Organization</NativeSelectOption>
                      <NativeSelectOption value="individual">Individual</NativeSelectOption>
                    </NativeSelect>
                  </div>
                )}
              </form.Field>

              <form.Field name="clientNumber">
                {(field) => (
                  <div className="flex flex-col gap-field">
                    <Label htmlFor={field.name}>Client number (optional)</Label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="2024-001"
                    />
                  </div>
                )}
              </form.Field>
            </div>
          </fieldset>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => exit.requestClose(onCancel)}
            >
              Cancel
            </Button>
          )}
          <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                disabled={!canSubmit || isSubmitting || createMutation.isPending}
                className="self-start"
              >
                {isSubmitting ? "Creating..." : "Create client"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
