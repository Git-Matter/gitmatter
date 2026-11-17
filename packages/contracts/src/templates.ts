import { z } from "zod";

export const templateContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(200_000),
  guidance: z.string().trim().max(5000).default(""),
  audience: z.enum(["legal", "workspace"]).default("legal"),
});
export type TemplateContent = z.infer<typeof templateContentSchema>;

export const templateSaveSchema = z.object({
  expectedHead: z.uuid(),
  content: templateContentSchema,
  message: z.string().trim().min(1).max(500),
});
export const templateActionSchema = z.object({
  expectedHead: z.uuid(),
  action: z.enum([
    "submit",
    "publish",
    "request_changes",
    "archive",
    "restore",
    "assign",
    "set_member",
    "remove_member",
  ]),
  revisionId: z.uuid().optional(),
  ownerId: z.string().min(1).optional(),
  reviewerId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  role: z.enum(["editor", "reviewer"]).optional(),
  message: z.string().trim().min(1).max(500),
});
export type TemplateRevisionView = TemplateContent & {
  id: string;
  version: number;
  createdBy: string | null;
  createdAt: string;
  file: { fileName: string; sizeBytes: number; sha256: string } | null;
};
export type TemplateView = {
  id: string;
  ownerId: string | null;
  ownerName: string | null;
  status: "draft" | "review" | "changes_requested" | "published" | "archived";
  headCommitId: string;
  canManage: boolean;
  canPublish: boolean;
  canEdit: boolean;
  canReview: boolean;
  canManageMembers: boolean;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewNote: string | null;
  members: Array<{ userId: string; name: string; role: "editor" | "reviewer" }>;
  publishedAt: string | null;
  publishedBy: string | null;
  publishedByName: string | null;
  draft: TemplateRevisionView | null;
  current: TemplateRevisionView | null;
};

export type TemplateRevisionSummary = Omit<TemplateRevisionView, "body" | "guidance">;
export type TemplateSummary = Omit<TemplateView, "draft" | "current"> & {
  draft: TemplateRevisionSummary | null;
  current: TemplateRevisionSummary | null;
};
export type TemplatePage = { items: TemplateSummary[]; nextCursor: string | null };
export const templateListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  view: z.enum(["all", "review", "returned", "archived"]).default("all"),
  q: z.string().trim().max(200).default(""),
});
