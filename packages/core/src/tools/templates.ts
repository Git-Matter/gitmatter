import { z } from "zod";
import {
  templateContentSchema,
  templateSaveSchema,
  templateListQuerySchema,
} from "@workspace/contracts";
import {
  createTemplate,
  currentTemplate,
  listTemplateSummaries,
  saveTemplate,
  TemplateError,
} from "../content/templates.js";
import type { ToolContext, ToolSpec } from "./types.js";

export function buildTemplateTools({ actor }: ToolContext): ToolSpec[] {
  const safely = (run: () => Promise<unknown>) =>
    run().catch((error: unknown) => ({
      error:
        error instanceof TemplateError
          ? error.message
          : error instanceof z.ZodError
            ? "Invalid template input"
            : "Template operation failed",
    }));
  return [
    {
      name: "list_templates",
      readOnly: true,
      description:
        "List a bounded page of template summaries, without document bodies. Filter by view or search text; pass nextCursor as cursor for another page. Readers see only published workspace templates; the template team can see draft metadata. Use get_template to read approved content. Matter-scoped tokens cannot access this library.",
      schema: templateListQuerySchema.shape,
      handler: (input) =>
        safely(() => listTemplateSummaries(actor, templateListQuerySchema.parse(input))),
    },
    {
      name: "get_template",
      readOnly: true,
      description:
        "Read the current approved template revision, with version, usage guidance, and original Word file metadata/hash when present. File-backed body text is an extracted preview; the Word download preserves the exact original. Never returns an unpublished draft.",
      schema: { templateId: z.uuid() },
      handler: ({ templateId }) => safely(() => currentTemplate(actor, templateId as string)),
    },
    {
      name: "create_template",
      description:
        "Create an audited template draft. A human assigned reviewer or workspace admin must approve it in the UI before anyone can download it as current.",
      schema: templateContentSchema.shape,
      handler: (input) =>
        safely(async () => ({
          id: await createTemplate(actor, templateContentSchema.parse(input)),
        })),
    },
    {
      name: "revise_template",
      description:
        "Save an immutable draft revision and reason, using the expected head from list_templates. Does not change the approved current version. Agents cannot approve templates.",
      schema: { templateId: z.uuid(), ...templateSaveSchema.shape },
      handler: (input) =>
        safely(async () => {
          await saveTemplate(actor, input.templateId as string, templateSaveSchema.parse(input));
          return { committed: true };
        }),
    },
  ];
}
