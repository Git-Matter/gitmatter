ALTER TABLE "workflows" ADD COLUMN "rules" jsonb;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "status" text DEFAULT 'approved' NOT NULL;