import { z } from "zod";

export const wordInspectionReasonSchema = z.enum([
  "invalid_archive",
  "archive_limits",
  "unsafe_xml",
  "malformed_xml",
  "missing_body",
  "unsupported_namespace",
  "unsupported_revision",
  "non_body_revision",
  "invalid_revision_binding",
  "storage_unavailable",
  "limited_body_content",
  "inspection_mismatch",
]);
export type WordInspectionReason = z.infer<typeof wordInspectionReasonSchema>;

/** Byte-bound technical evidence. This never means a lawyer accepted the source. */
export const wordInspectionSchema = z.object({
  schemaVersion: z.literal(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["complete", "uninspectable"]),
  textView: z.enum(["accepted_body", "limited_body"]),
  stories: z.object({
    body: z.number().int().nonnegative(),
    headers: z.number().int().nonnegative(),
    footers: z.number().int().nonnegative(),
    footnotes: z.number().int().nonnegative(),
    endnotes: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
  revisions: z.object({
    insertions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    moves: z.number().int().nonnegative(),
    formatting: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
  reasons: z.array(wordInspectionReasonSchema),
  // Internal binding evidence has hashes only, never revision text or author metadata.
  bodyBindings: z.array(
    z.object({
      id: z.string().max(64),
      kind: z.enum(["ins", "del"]),
      textHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
  ),
});
export type WordInspection = z.infer<typeof wordInspectionSchema>;

export type DocumentWordInspection = {
  versionId: string;
  inspection: Omit<WordInspection, "bodyBindings">;
  registeredRevisions: number;
  incomingRevisions: number;
  safeToEdit: boolean;
  safeClean: boolean;
};
