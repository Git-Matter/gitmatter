ALTER TABLE "mcp_access_tokens" ADD COLUMN "allowed_matter_ids" jsonb;--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD COLUMN "max_role" text;