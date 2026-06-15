CREATE TABLE "hidden_workflows" (
	"user_id" text NOT NULL,
	"workflow_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hidden_workflows_user_id_workflow_id_pk" PRIMARY KEY("user_id","workflow_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"shared_with_email" text NOT NULL,
	"allow_edit" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_share_unique" UNIQUE("workflow_id","shared_with_email")
);
--> statement-breakpoint
ALTER TABLE "hidden_workflows" ADD CONSTRAINT "hidden_workflows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_workflows" ADD CONSTRAINT "hidden_workflows_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_shares" ADD CONSTRAINT "workflow_shares_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_shares" ADD CONSTRAINT "workflow_shares_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_shares_email_idx" ON "workflow_shares" USING btree ("shared_with_email");