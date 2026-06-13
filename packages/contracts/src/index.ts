// Shared client <-> server contracts. Types only — no runtime deps — so both the
// browser client (apps/web/src/lib/api.ts) and the server (packages/core) import
// one source of truth for the API wire shapes. Grouped by domain.

export * from "./llmProvider/index.js";
