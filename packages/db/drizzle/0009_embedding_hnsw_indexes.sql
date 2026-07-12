-- Vector ANN indexes for document_chunk_embeddings.
--
-- The `embedding` column is intentionally dimensionless (type `vector`, no N) so
-- one table can hold rows from multiple embedding profiles at once (e.g. OpenAI
-- 1536-dim and Gemini 768-dim). A plain HNSW index needs a fixed dimension, so we
-- add one PARTIAL index per dimension, each over the `embedding::vector(N)` cast
-- and gated by `WHERE dimensions = N`. This matches the query in
-- packages/core/src/content/chunks.ts, which casts to vector(dimensions) and
-- orders by the cosine operator `<=>` — verified to plan as an HNSW index scan.
--
-- Covered dimensions are the two shipped defaults in
-- packages/core/src/ai/embeddings.ts (DEFAULTS): Gemini text-embedding-004 = 768,
-- OpenAI text-embedding-3-small = 1536. A deployment that sets a custom
-- EMBEDDING_DIMENSIONS needs its own matching index added here.
--
-- Note: non-CONCURRENT build takes a write lock while the index is created. Fine
-- while these tables are small (the feature is new). If a large table ever needs
-- reindexing, build CONCURRENTLY outside a migration transaction instead.

CREATE INDEX IF NOT EXISTS "document_chunk_embeddings_hnsw_768"
  ON "document_chunk_embeddings"
  USING hnsw (("embedding"::vector(768)) vector_cosine_ops)
  WHERE "dimensions" = 768;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_embeddings_hnsw_1536"
  ON "document_chunk_embeddings"
  USING hnsw (("embedding"::vector(1536)) vector_cosine_ops)
  WHERE "dimensions" = 1536;
