ALTER TABLE "job_spend_reservations" ALTER COLUMN "job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_spend_reservations" ADD COLUMN "operation_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "job_spend_reservations" ADD COLUMN "source_kind" text DEFAULT 'durable_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_spend_reservations" ADD COLUMN "actor" jsonb;--> statement-breakpoint
ALTER TABLE "job_spend_reservations" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "job_spend_reservations" ADD COLUMN "dispatched_at" timestamp;--> statement-breakpoint
ALTER TABLE "job_spend_reservations" ADD COLUMN "lease_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "job_spend_reservations" ADD CONSTRAINT "job_spend_reservations_operation_id_unique" UNIQUE("operation_id");