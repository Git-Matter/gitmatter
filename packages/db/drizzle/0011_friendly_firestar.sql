CREATE TABLE "approval_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"artifact_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"proposal_commit_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"policy_revision" integer NOT NULL,
	"required_role" text NOT NULL,
	"proposer_id" text NOT NULL,
	"agent_label" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_commit_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commit_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"proposal_revision" integer NOT NULL,
	"proposal_commit_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"captured_policy_revision" integer NOT NULL,
	"current_policy_revision" integer NOT NULL,
	"source_version_id" uuid,
	"base_cell_commit_id" uuid,
	"actor_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"application_commit_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "approval_terminal_unique" UNIQUE("proposal_id","proposal_revision"),
	CONSTRAINT "approval_request_unique" UNIQUE("actor_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "job_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"operation_key" text NOT NULL,
	"commit_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_receipts_operation_unique" UNIQUE("job_id","operation_key")
);
--> statement-breakpoint
CREATE TABLE "job_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"unit_key" text NOT NULL,
	"commit_id" uuid,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_units_key_unique" UNIQUE("job_id","unit_key")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"tenant_id" uuid NOT NULL,
	"matter_id" uuid,
	"artifact_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"actor" jsonb NOT NULL,
	"credential_id" uuid,
	"input_version_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lease_owner" text,
	"lease_epoch" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"cancellation_requested_at" timestamp,
	"error_code" text,
	"result_commit_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_request_unique" UNIQUE("tenant_id","user_id","kind","request_id")
);
--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "approval_policy" jsonb DEFAULT '{"agentCells":"direct"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "approval_policy_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "head_commit_id" uuid;--> statement-breakpoint
ALTER TABLE "document_edits" ADD COLUMN "finding_provenance" jsonb;--> statement-breakpoint
ALTER TABLE "tabular_cells" ADD COLUMN "finding" jsonb;--> statement-breakpoint
ALTER TABLE "tabular_cells" ADD COLUMN "disposition" jsonb;--> statement-breakpoint
ALTER TABLE "tabular_reviews" ADD COLUMN "input_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "tabular_reviews" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "tabular_reviews" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
ALTER TABLE "approval_proposals" ADD CONSTRAINT "approval_proposals_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_proposals" ADD CONSTRAINT "approval_proposals_proposer_id_user_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_approvals" ADD CONSTRAINT "commit_approvals_proposal_id_approval_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."approval_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_approvals" ADD CONSTRAINT "commit_approvals_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_receipts" ADD CONSTRAINT "job_receipts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_units" ADD CONSTRAINT "job_units_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_queue_idx" ON "approval_proposals" USING btree ("matter_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "jobs_lease_idx" ON "jobs" USING btree ("state","lease_expires_at");--> statement-breakpoint
CREATE INDEX "jobs_artifact_idx" ON "jobs" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "jobs_capacity_idx" ON "jobs" USING btree ("tenant_id","user_id","state");--> statement-breakpoint
ALTER TABLE "tabular_reviews" ADD CONSTRAINT "tabular_review_request_unique" UNIQUE("request_key");