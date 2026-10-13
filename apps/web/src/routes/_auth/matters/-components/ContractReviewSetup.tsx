import { useId, useRef, useState } from "react";
import { reviewInstructionsSchema, type ReviewInstructions } from "@workspace/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/data/api";

/** Compact input confirmation beside the matter documents; inference remains an explicit run. */
export function ContractReviewSetup({
  matterId,
  onClose,
  executionRoute,
  preferredModel,
}: {
  matterId: string;
  onClose: () => void;
  executionRoute?: "application" | "agent";
  preferredModel?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [playbookId, setPlaybookId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewInstructions, setReviewInstructions] = useState<ReviewInstructions>({
    representedParty: null,
    disclosureRole: "unknown",
    ndaStructure: "unknown",
    businessPurpose: null,
    governingLaw: null,
  });
  const parsedInstructions = reviewInstructionsSchema.safeParse(reviewInstructions);
  const requestId = useRef(crypto.randomUUID());
  const {
    data: documents = [],
    isPending: documentsLoading,
    error: documentsError,
  } = useQuery({
    queryKey: ["matter-review-documents", matterId],
    queryFn: () => api.listMatterDocuments(matterId),
  });
  const {
    data: readiness,
    isPending: workflowsLoading,
    error: workflowsError,
  } = useQuery({
    queryKey: ["first-review", matterId],
    queryFn: () => api.getFirstReviewStatus(matterId),
  });
  const approved = readiness?.playbooks ?? [];
  const create = useMutation({
    mutationFn: () =>
      api.runPlaybook(playbookId, {
        matterId,
        documentIds: selected,
        requestId: requestId.current,
        reviewInstructions: reviewInstructionsSchema.parse(reviewInstructions),
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["first-review", matterId] });
      void navigate({
        to: "/reviews/$id",
        params: { id: result.reviewId },
        search: { executionRoute, model: preferredModel },
      });
    },
  });
  return (
    <section className="flex flex-col gap-4 py-4" aria-label="Review contract setup">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl">Review contract</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close setup
        </Button>
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">
        Prepare a version-bound review using the firm's approved positions. On the review, run your
        selected model or ask your connected agent to populate cited findings.
      </p>
      {(documentsLoading || workflowsLoading) && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading review inputs…
        </p>
      )}
      {(documentsError || workflowsError) && (
        <p role="alert" className="text-sm text-destructive">
          Could not load review inputs. Close and reopen setup to retry.
        </p>
      )}
      {!documentsLoading && !documents.length && (
        <p className="text-sm">Add a document to this matter first.</p>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Documents</legend>
        {documents.map((doc) => (
          <label key={doc.id} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              disabled={doc.status !== "ready" || create.isPending}
              checked={selected.includes(doc.id)}
              onChange={(e) => {
                requestId.current = crypto.randomUUID();
                setSelected((value) =>
                  e.target.checked ? [...value, doc.id] : value.filter((id) => id !== doc.id)
                );
              }}
            />
            <span className="min-w-0 truncate">{doc.title}</span>
            <span className="text-xs text-muted-foreground">
              {doc.status === "ready"
                ? "Ready"
                : doc.status === "failed"
                  ? "Extraction failed — retry from Documents"
                  : "Preparing source"}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="block max-w-lg space-y-2 text-sm">
        <span className="font-medium">Approved playbook</span>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3"
          value={playbookId}
          disabled={create.isPending}
          onChange={(e) => {
            requestId.current = crypto.randomUUID();
            setPlaybookId(e.target.value);
          }}
        >
          <option value="">Choose playbook</option>
          {approved.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title} · {w.ruleCount} rules
            </option>
          ))}
        </select>
      </label>
      {!workflowsLoading && !approved.length && (
        <p className="text-sm text-muted-foreground">
          No approved playbook is available.{" "}
          <Link to="/library" className="underline">
            Open Library to prepare one.
          </Link>
        </p>
      )}
      {readiness?.matter?.canEdit === false && (
        <p role="status" className="text-sm text-muted-foreground">
          You can view this matter. Editor access is required to prepare a review.
        </p>
      )}
      <ReviewInstructionsFields
        value={reviewInstructions}
        disabled={create.isPending}
        onChange={(value) => {
          requestId.current = crypto.randomUUID();
          setReviewInstructions(value);
        }}
      />
      {create.error && (
        <p role="alert" className="text-sm text-destructive">
          {create.error instanceof Error ? create.error.message : "Review preparation failed"}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={
            readiness?.matter?.canEdit !== true ||
            !selected.length ||
            !selected.every((id) =>
              documents.some((document) => document.id === id && document.status === "ready")
            ) ||
            !approved.some((playbook) => playbook.id === playbookId) ||
            create.isPending ||
            !parsedInstructions.success
          }
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Preparing…" : "Prepare review"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Sources, playbook rules and instructions are captured before analysis. Changing
          instructions requires a new review.
        </span>
      </div>
    </section>
  );
}

function ReviewInstructionsFields({
  value,
  disabled,
  onChange,
}: {
  value: ReviewInstructions;
  disabled: boolean;
  onChange: (value: ReviewInstructions) => void;
}) {
  const id = useId();
  const result = reviewInstructionsSchema.safeParse(value);
  const errorFor = (field: keyof ReviewInstructions) =>
    result.success
      ? undefined
      : result.error.issues.find((issue) => issue.path[0] === field)?.message;
  const textFields = [
    {
      key: "representedParty",
      label: "Party we represent",
      maxLength: 300,
      help: "Use the legal party name or a clear description. The matter's client is not assumed.",
    },
    {
      key: "businessPurpose",
      label: "Business purpose",
      maxLength: 2000,
      help: "Describe why information is being shared, such as evaluating a potential collaboration.",
    },
    {
      key: "governingLaw",
      label: "Governing law context",
      maxLength: 500,
      help: "State the instructed or proposed jurisdiction. This does not change the contract's governing-law clause.",
    },
  ] as const;
  return (
    <FieldSet disabled={disabled}>
      <FieldLegend>Review instructions</FieldLegend>
      <FieldDescription>
        Confirm the context for this review. Unknown values remain unknown and may require a
        lawyer's judgment.
      </FieldDescription>
      <FieldGroup>
        {textFields.map((field) => {
          const inputId = `${id}-${field.key}`;
          const error = errorFor(field.key);
          return (
            <Field key={field.key} data-invalid={!!error} data-disabled={disabled}>
              <FieldLabel htmlFor={inputId}>{field.label}</FieldLabel>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`${field.label}: unknown or not instructed`}
                  disabled={disabled}
                  checked={value[field.key] === null}
                  onChange={(event) =>
                    onChange({ ...value, [field.key]: event.target.checked ? null : "" })
                  }
                />
                Unknown or not instructed
              </label>
              {field.key === "businessPurpose" ? (
                <Textarea
                  id={inputId}
                  aria-invalid={!!error}
                  aria-describedby={`${inputId}-help`}
                  disabled={disabled || value[field.key] === null}
                  maxLength={field.maxLength}
                  value={value[field.key] ?? ""}
                  onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                />
              ) : (
                <Input
                  id={inputId}
                  aria-invalid={!!error}
                  aria-describedby={`${inputId}-help`}
                  disabled={disabled || value[field.key] === null}
                  maxLength={field.maxLength}
                  value={value[field.key] ?? ""}
                  onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                />
              )}
              <FieldDescription id={`${inputId}-help`}>{field.help}</FieldDescription>
              {error && <FieldError>{error}</FieldError>}
            </Field>
          );
        })}
        <Field data-disabled={disabled}>
          <FieldLabel id={`${id}-disclosure-label`}>Our disclosure role</FieldLabel>
          <ToggleGroup
            aria-labelledby={`${id}-disclosure-label`}
            value={[value.disclosureRole]}
            className="w-full flex-wrap justify-start"
            variant="outline"
            disabled={disabled}
            onValueChange={(roles) => {
              const role = roles[0];
              if (
                role === "unknown" ||
                role === "receiving" ||
                role === "disclosing" ||
                role === "both"
              )
                onChange({ ...value, disclosureRole: role });
            }}
          >
            <ToggleGroupItem value="unknown">Unknown or not instructed</ToggleGroupItem>
            <ToggleGroupItem value="receiving">Receiving information</ToggleGroupItem>
            <ToggleGroupItem value="disclosing">Disclosing information</ToggleGroupItem>
            <ToggleGroupItem value="both">Both receiving and disclosing</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field data-disabled={disabled}>
          <FieldLabel id={`${id}-structure-label`}>NDA structure</FieldLabel>
          <ToggleGroup
            aria-labelledby={`${id}-structure-label`}
            value={[value.ndaStructure]}
            className="w-full flex-wrap justify-start"
            variant="outline"
            disabled={disabled}
            onValueChange={(structures) => {
              const structure = structures[0];
              if (structure === "unknown" || structure === "mutual" || structure === "unilateral")
                onChange({ ...value, ndaStructure: structure });
            }}
          >
            <ToggleGroupItem value="unknown">Unknown or not instructed</ToggleGroupItem>
            <ToggleGroupItem value="mutual">Mutual</ToggleGroupItem>
            <ToggleGroupItem value="unilateral">Unilateral</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field data-invalid={!!errorFor("additionalInstructions")} data-disabled={disabled}>
          <FieldLabel htmlFor={`${id}-additional`}>
            Additional review instructions (optional)
          </FieldLabel>
          <Textarea
            id={`${id}-additional`}
            disabled={disabled}
            aria-invalid={!!errorFor("additionalInstructions")}
            maxLength={4000}
            value={value.additionalInstructions ?? ""}
            onChange={(event) => onChange({ ...value, additionalInstructions: event.target.value })}
          />
          <FieldDescription>
            These instructions provide context. They do not approve changes or override the firm's
            approved positions.
          </FieldDescription>
          {errorFor("additionalInstructions") && (
            <FieldError>{errorFor("additionalInstructions")}</FieldError>
          )}
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
