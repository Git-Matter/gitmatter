import { notifySuccess } from "@/lib/feedback";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import {
  templateContentSchema,
  type TemplateContent,
  type TemplateView,
} from "@workspace/contracts";
import { api } from "@/lib/data/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DiscardChangesDialog, UnsavedNavigationGuard } from "@/components/UnsavedChangesGuard";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  formatBytes,
  isTemplateConflict,
  refreshTemplateQueries,
  templateQueryKey,
} from "./template-ui";

const blank: TemplateContent = {
  title: "",
  category: "Commercial",
  body: "",
  guidance: "",
  audience: "legal",
};

export function TemplateEditor({
  item,
  onClose,
  returnFocus,
}: {
  item: TemplateView | "new";
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const client = useQueryClient();
  const existing = item === "new" ? null : item;
  const [initial] = useState<TemplateContent>(() => {
    const content = existing?.draft ?? existing?.current ?? blank;
    return {
      title: content.title,
      category: content.category,
      body: content.body,
      guidance: content.guidance,
      audience: content.audience,
    };
  });
  const [content, setContent] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [message, setMessage] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const existingFile = existing?.draft?.file ?? existing?.current?.file;
  const hasOriginal = !!existingFile;
  const mutation = useMutation({
    mutationFn: async () => {
      if (file) {
        if (existing)
          await api.saveTemplateFromFile(
            existing.id,
            existing.headCommitId,
            content,
            message,
            file
          );
        else await api.createTemplateFromFile(content, file);
      } else if (existing) {
        await api.saveTemplate(existing.id, existing.headCommitId, content, message);
      } else {
        await api.createTemplate(content);
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: templateQueryKey });
      notifySuccess(
        existing
          ? "Working revision saved. The approved version is unchanged."
          : "Template draft created. Choose a reviewer to publish it."
      );
      onClose();
    },
    onError: async (error) => {
      if (existing && isTemplateConflict(error)) await refreshTemplateQueries(client, existing.id);
    },
  });
  const dirty =
    !mutation.isSuccess &&
    (!!file || !!message || JSON.stringify(content) !== JSON.stringify(initial));
  const valid =
    templateContentSchema.safeParse({
      ...content,
      body: file ? "Document text is extracted from the selected Word file" : content.body,
    }).success &&
    (!existing || !!message.trim()) &&
    !fileError;
  const update = <K extends keyof TemplateContent>(field: K, value: TemplateContent[K]) =>
    setContent((previous) => ({ ...previous, [field]: value }));
  function requestClose() {
    if (mutation.isPending) return;
    if (dirty) setDiscarding(true);
    else onClose();
  }

  return (
    <>
      <UnsavedNavigationGuard
        isDirty={() => dirty}
        title="Keep your unsaved revision?"
        saving={mutation.isPending}
      />
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          finalFocus={returnFocus}
          className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-none overflow-y-auto sm:max-w-3xl md:max-w-3xl lg:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle>{existing ? "Create working revision" : "New template"}</DialogTitle>
            <DialogDescription>
              {existing
                ? "Keep improving the next version while your team uses the last approved file."
                : "Start with your existing Word document. Its formatting and original bytes stay with the revision."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) mutation.mutate();
            }}
          >
            <fieldset disabled={mutation.isPending} className="min-w-0">
              <FieldGroup>
                <div className="grid gap-5 sm:grid-cols-[1.5fr_1fr]">
                  <Field>
                    <FieldLabel htmlFor="template-title">Template name</FieldLabel>
                    <Input
                      id="template-title"
                      name="title"
                      autoComplete="off"
                      required
                      maxLength={200}
                      value={content.title}
                      onChange={(event) => update("title", event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="template-category">Category</FieldLabel>
                    <Input
                      id="template-category"
                      name="category"
                      autoComplete="off"
                      required
                      maxLength={100}
                      value={content.category}
                      onChange={(event) => update("category", event.target.value)}
                    />
                  </Field>
                </div>
                <Field data-invalid={!!fileError}>
                  <FieldLabel htmlFor="template-file">
                    {hasOriginal ? "Replace the Word document" : "Original Word document"}
                  </FieldLabel>
                  <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4">
                    {hasOriginal && !file && (
                      <div className="flex items-center gap-3">
                        <FileText
                          aria-hidden="true"
                          className="size-5 shrink-0 text-muted-foreground"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium break-words">{existingFile.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            Original retained · {formatBytes(existingFile.sizeBytes)}
                          </p>
                        </div>
                      </div>
                    )}
                    <Input
                      id="template-file"
                      name="file"
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      aria-invalid={!!fileError}
                      onChange={(event) => {
                        const selected = event.target.files?.[0] ?? null;
                        if (selected && !selected.name.toLowerCase().endsWith(".docx")) {
                          setFileError("Choose a .docx Word document.");
                          setFile(null);
                          return;
                        }
                        if (selected && selected.size > 20 * 1024 * 1024) {
                          setFileError("Choose a Word document smaller than 20 MB.");
                          setFile(null);
                          return;
                        }
                        setFileError("");
                        setFile(selected);
                        if (selected && !content.title.trim())
                          update("title", selected.name.replace(/\.docx$/i, ""));
                      }}
                    />
                    {file && (
                      <p className="text-xs text-muted-foreground">
                        Selected: {file.name} · {formatBytes(file.size)}
                      </p>
                    )}
                  </div>
                  {fileError ? (
                    <p role="alert" className="text-xs text-destructive">
                      {fileError}
                    </p>
                  ) : (
                    <FieldDescription>
                      {hasOriginal
                        ? "Change the document language in Word, then upload the revised .docx. Metadata-only edits retain the original file."
                        : "Tables, numbering, headers, and signature blocks remain in the exact file that gets approved and downloaded."}
                    </FieldDescription>
                  )}
                </Field>
                {!file && (
                  <Field>
                    <FieldLabel htmlFor="template-body">
                      {hasOriginal ? "Extracted text reference" : "Or start with template text"}
                    </FieldLabel>
                    <Textarea
                      id="template-body"
                      name="body"
                      autoComplete="off"
                      required={!file}
                      readOnly={hasOriginal}
                      rows={hasOriginal ? 5 : 8}
                      maxLength={200000}
                      value={content.body}
                      onChange={(event) => update("body", event.target.value)}
                    />
                    <FieldDescription>
                      {hasOriginal
                        ? "Read-only reference. The original Word file is the source of truth."
                        : "Text-only templates download in a clean generated Word layout. Upload a Word file when its formatting matters."}
                    </FieldDescription>
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="template-guidance">When to use it</FieldLabel>
                  <Textarea
                    id="template-guidance"
                    name="guidance"
                    autoComplete="off"
                    rows={3}
                    maxLength={5000}
                    value={content.guidance}
                    onChange={(event) => update("guidance", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="template-audience">Approved access</FieldLabel>
                  <Select
                    value={content.audience}
                    onValueChange={(value) => {
                      if (value) update("audience", value as TemplateContent["audience"]);
                    }}
                  >
                    <SelectTrigger id="template-audience" className="w-full">
                      <SelectValue>
                        {content.audience === "legal"
                          ? "Template team only"
                          : "Everyone in this workspace, including sales"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="legal">Template team only</SelectItem>
                        <SelectItem value="workspace">
                          Everyone in this workspace, including sales
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    The template team can work on drafts. Other workspace members only see approved
                    versions. Access changes take effect when published.
                  </FieldDescription>
                </Field>
                {existing && (
                  <Field>
                    <FieldLabel htmlFor="template-message">Reason for this revision</FieldLabel>
                    <Input
                      id="template-message"
                      name="message"
                      autoComplete="off"
                      required
                      maxLength={500}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                  </Field>
                )}
              </FieldGroup>
            </fieldset>
            {mutation.isError && (
              <Alert variant="destructive">
                <AlertTitle>Revision was not saved</AlertTitle>
                <AlertDescription>
                  {mutation.error.message}
                  {existing && isTemplateConflict(mutation.error) && (
                    <>
                      <p>
                        Your unsaved inputs and selected file are kept here. Review the latest
                        revision before reconciling these changes.
                      </p>
                      <a
                        href={`/library?template=${encodeURIComponent(existing.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 underline underline-offset-4"
                      >
                        Review latest revision in a new tab
                      </a>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <FieldDescription id="template-save-hint">
              Enter a template name, category and document text or a valid Word file.{" "}
              {existing
                ? "A change reason is required for a new working revision."
                : "New templates are saved as drafts for review."}
            </FieldDescription>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={mutation.isPending}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                aria-describedby="template-save-hint"
                disabled={!valid || mutation.isPending}
              >
                {mutation.isPending && <Spinner data-icon="inline-start" />}
                {mutation.isPending
                  ? "Saving…"
                  : existing
                    ? "Save working revision"
                    : "Create draft"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        title="Keep your unsaved revision?"
        saving={mutation.isPending}
        open={discarding}
        onKeep={() => setDiscarding(false)}
        onDiscard={onClose}
      />
    </>
  );
}
