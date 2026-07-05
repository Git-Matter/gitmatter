// Tabular review engine, split by responsibility: extract.ts (pure LLM → cell),
// runner.ts (run + commit cells on the audit spine), reviews.ts (review/column
// definition), queries.ts (read side). Consumers keep importing from
// "@workspace/core".

// Extraction helpers (coerce*/stripJsonFence stay internal to the engine).
export { type CellResult, queryCell, queryRow } from "./extract.js";
export * from "./runner.js";
export * from "./reviews.js";
export * from "./queries.js";
export * from "./playbook.js";
