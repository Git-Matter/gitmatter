CREATE TABLE "clauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"tenant_id" uuid NOT NULL,
	"matter_id" uuid,
	"client_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text NOT NULL,
	"jurisdiction" text,
	"risk_rating" text DEFAULT 'acceptable' NOT NULL,
	"guidance" text,
	"tags" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"parent_clause_id" uuid,
	"fallback_rank" integer,
	"source_matter_id" uuid,
	"created_by" text,
	"head_commit_id" uuid,
	"field_commits" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clauses_tenant_category_idx" ON "clauses" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "clauses_parent_idx" ON "clauses" USING btree ("parent_clause_id");