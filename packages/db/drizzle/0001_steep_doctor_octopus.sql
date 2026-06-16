CREATE TABLE "practice_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "practice_area_user_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "practice_areas" ADD CONSTRAINT "practice_areas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;