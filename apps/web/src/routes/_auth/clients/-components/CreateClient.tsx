import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";

export function CreateClient({ onCreated }: { onCreated: () => void }) {
  const qc = useQueryClient();
  const createMutation = useMutation({
    mutationFn: (d: { name: string; type: "organization" | "individual"; clientNumber?: string }) =>
      api.createClient(d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.clients });
      toast.success("Client created");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New client</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
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
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Acme Corp"
                />
                {field.state.meta.isTouched && field.state.meta.errors[0] && (
                  <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                )}
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-stack">
            <form.Field name="type">
              {(field) => (
                <div className="flex flex-col gap-field">
                  <Label htmlFor={field.name}>Type</Label>
                  <select
                    id={field.name}
                    className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value as "organization" | "individual")
                    }
                  >
                    <option value="organization">Organization</option>
                    <option value="individual">Individual</option>
                  </select>
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

          <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit} className="self-start">
                {isSubmitting ? "Creating..." : "Create client"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
