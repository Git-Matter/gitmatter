CREATE TABLE "document_edit_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edit_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"proposed_version_id" uuid,
	"reviewed_version_id" uuid,
	"content_hash" text NOT NULL,
	"policy_context" jsonb NOT NULL,
	"legacy" boolean NOT NULL,
	"actor_id" text NOT NULL,
	"decision" text NOT NULL,
	"application_commit_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_edit_decisions_edit_id_unique" UNIQUE("edit_id")
);
--> statement-breakpoint
CREATE TABLE "job_control_policies" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"policy" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staged_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"state" text DEFAULT 'staged' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staged_objects_storage_path_unique" UNIQUE("storage_path")
);
--> statement-breakpoint
ALTER TABLE "document_edits" ADD COLUMN "approval_context" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "approved_version_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "approved_markdown" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "last_retry_request_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "last_retry_fingerprint" text;--> statement-breakpoint
ALTER TABLE "document_edit_decisions" ADD CONSTRAINT "document_edit_decisions_edit_id_document_edits_id_fk" FOREIGN KEY ("edit_id") REFERENCES "public"."document_edits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_edit_decisions" ADD CONSTRAINT "document_edit_decisions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_edit_decisions" ADD CONSTRAINT "document_edit_decisions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_control_policies" ADD CONSTRAINT "job_control_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_objects" ADD CONSTRAINT "staged_objects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staged_objects_reconcile_idx" ON "staged_objects" USING btree ("state","expires_at");
--> statement-breakpoint
-- Accepted content pointers do not invent historical legal approvals. Legacy
-- pending drafts remain unbound until a person resolves their changes.
UPDATE "documents" d SET
  "approved_version_id" = d."current_version_id",
  "approved_markdown" = d."markdown"
WHERE NOT EXISTS (
  SELECT 1 FROM "document_edits" e
  WHERE e."document_id" = d."id" AND e."status" = 'pending'
)
AND (
  (d."current_version_id" IS NULL AND d."file_type" = 'text')
  OR EXISTS (
    SELECT 1 FROM "document_versions" v
    WHERE v."id" = d."current_version_id" AND v."document_id" = d."id"
    AND v."source" IN ('upload', 'generated', 'replace', 'user_accept', 'user_reject')
    AND v."deleted_at" IS NULL
  )
);
