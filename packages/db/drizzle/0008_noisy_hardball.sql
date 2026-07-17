ALTER TABLE "tenants" ADD COLUMN "storage_region" text;--> statement-breakpoint
UPDATE "tenants" SET "storage_region" = 'legacy' WHERE "storage_region" IS NULL;
