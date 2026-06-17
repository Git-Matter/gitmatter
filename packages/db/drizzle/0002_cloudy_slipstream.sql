CREATE TABLE "artifact_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_type" text NOT NULL,
	"artifact_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"added_by" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_share_unique" UNIQUE("artifact_type","artifact_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "artifact_shares" ADD CONSTRAINT "artifact_shares_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_shares" ADD CONSTRAINT "artifact_shares_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_shares_user_idx" ON "artifact_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artifact_shares_artifact_idx" ON "artifact_shares" USING btree ("artifact_type","artifact_id");