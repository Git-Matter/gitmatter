ALTER TABLE "clauses" ADD COLUMN "overrides_clause_id" uuid;--> statement-breakpoint
CREATE INDEX "clauses_overrides_idx" ON "clauses" USING btree ("overrides_clause_id");--> statement-breakpoint
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_fallback_rank_unique" UNIQUE("parent_clause_id","fallback_rank");--> statement-breakpoint
-- Playbooks are firm standards, not artifacts of the creator's default matter.
UPDATE "workflows" SET "matter_id" = NULL WHERE "type" = 'playbook';
