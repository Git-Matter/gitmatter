import { z } from "zod";

export const createDocumentSchema = z.object({
  title: z.string().min(1),
  markdown: z.string().min(1),
  fileType: z.string().optional(),
  matterId: z.string().uuid().optional(),
  folderId: z.string().uuid().nullish(),
});

export const proposeEditSchema = z.object({
  find: z.string(),
  replace: z.string(),
  reason: z.string().optional(),
});

const documentResolutionContext = {
  expectedHeadCommitId: z.uuid().nullable().optional(),
  approvalContext: z
    .array(
      z
        .object({
          matterId: z.uuid(),
          policyRevision: z.number().int().nonnegative(),
          requiredRole: z.enum(["editor", "owner"]),
        })
        .strict()
    )
    .optional(),
};
export const resolveEditSchema = z
  .object({ decision: z.enum(["accept", "reject"]), ...documentResolutionContext })
  .strict();

export const resolveBatchSchema = z.object({
  changeIds: z.array(z.string()).min(1),
  decision: z.enum(["accept", "reject"]),
  ...documentResolutionContext,
});

export const renameDocumentSchema = z.object({ title: z.string().min(1) });

export const linkDocumentsSchema = z.object({
  matterId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1),
});
