CREATE TABLE "template_members" (
	"template_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "template_members_template_id_user_id_pk" PRIMARY KEY("template_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "template_revisions" ADD COLUMN "storage_path" text;--> statement-breakpoint
ALTER TABLE "template_revisions" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "template_revisions" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "template_revisions" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "reviewer_id" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "published_by" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "template_members" ADD CONSTRAINT "template_members_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_members" ADD CONSTRAINT "template_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_members_user_idx" ON "template_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;