ALTER TABLE "usage_events" ADD COLUMN "matter_id" uuid;--> statement-breakpoint
CREATE INDEX "usage_events_matter_created_idx" ON "usage_events" USING btree ("matter_id","created_at");