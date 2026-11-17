CREATE TABLE "practice_profiles" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"correspondence_header" text DEFAULT '' NOT NULL,
	"sign_off" text DEFAULT '' NOT NULL,
	"jurisdiction" text DEFAULT 'AU' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reviewer_id" text,
	"reviewer_name" text NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	"scope" text NOT NULL,
	"document_version_id" uuid,
	"state_token" text NOT NULL,
	"commit_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "jurisdiction" text;--> statement-breakpoint
ALTER TABLE "practice_profiles" ADD CONSTRAINT "practice_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_profiles" ADD CONSTRAINT "practice_profiles_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_reviews_document_idx" ON "document_reviews" USING btree ("document_id","reviewed_at");