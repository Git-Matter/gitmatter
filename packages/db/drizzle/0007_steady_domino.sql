CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"token_estimate" integer NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"label" text,
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_chunks_doc_version_index_unique" UNIQUE("document_id","version_id","chunk_index")
);
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "cached_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "cache_write_tokens" integer;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "cache_read_tokens" integer;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "cache_mode" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "cache_key" text;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_chunks_doc_idx" ON "document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_chunks_version_idx" ON "document_chunks" USING btree ("version_id");