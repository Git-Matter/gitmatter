CREATE TABLE "job_notification_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_notification_reads_user_unique" UNIQUE("notification_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "job_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"matter_id" uuid,
	"revision" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_notifications_revision_unique" UNIQUE("job_id","revision")
);
--> statement-breakpoint
ALTER TABLE "job_notification_reads" ADD CONSTRAINT "job_notification_reads_notification_id_job_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."job_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notifications" ADD CONSTRAINT "job_notifications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notifications" ADD CONSTRAINT "job_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_notifications_matter_idx" ON "job_notifications" USING btree ("tenant_id","matter_id","created_at");