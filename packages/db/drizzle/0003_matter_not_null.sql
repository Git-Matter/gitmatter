ALTER TABLE "documents" ALTER COLUMN "matter_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tabular_reviews" ALTER COLUMN "matter_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "matter_id" SET NOT NULL;