ALTER TABLE "documents" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;