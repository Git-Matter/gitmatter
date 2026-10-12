CREATE TABLE "job_spend_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"lease_epoch" integer NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"matter_id" uuid,
	"token_id" uuid,
	"run_id" uuid,
	"model" text NOT NULL,
	"reserved_tokens" integer NOT NULL,
	"reserved_usd" double precision,
	"actual_tokens" integer,
	"actual_usd" double precision,
	"state" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_spend_attempt_unique" UNIQUE("job_id","lease_epoch")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "artifact_type" text DEFAULT 'document' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "source_document_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "column_index" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "snapshot_fingerprint" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "base_cell_commit_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "job_spend_reservations" ADD CONSTRAINT "job_spend_reservations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_spend_reservations" ADD CONSTRAINT "job_spend_reservations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_spend_tenant_idx" ON "job_spend_reservations" USING btree ("tenant_id","created_at");