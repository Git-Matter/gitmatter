-- HNSW ANN index for 1024-dimension embeddings. Adds Voyage AI's dimension to the
-- per-dimension index set started in 0009 (768 Gemini, 1536 OpenAI). Voyage's
-- default legal-tuned model, voyage-law-2, is 1024-dim; voyage-4 also defaults to
-- 1024. Same partial-expression pattern: the query in
-- packages/core/src/content/chunks.ts casts to vector(dimensions) and orders by
-- the cosine operator `<=>`, so this index is used for `dimensions = 1024` rows.

CREATE INDEX IF NOT EXISTS "document_chunk_embeddings_hnsw_1024"
  ON "document_chunk_embeddings"
  USING hnsw (("embedding"::vector(1024)) vector_cosine_ops)
  WHERE "dimensions" = 1024;
