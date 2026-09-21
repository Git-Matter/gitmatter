import type { z } from "zod";
import type { Actor } from "../core/index.js";

// One tool definition both consumers share: the MCP server (server.ts) wraps the
// handler's return in MCP content blocks; the chat loop (chat.ts) JSON-stringifies
// it as a tool result. `schema` is a zod raw shape — MCP takes it directly, chat
// converts it to JSON Schema. Handlers return plain data (never throw to the model:
// return an `{ error }` object instead, matching the prior MCP behavior).
export type ToolSpec = {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  /** Provider inference needs separately billed API access; subscription agents supply their own analysis. */
  execution?: "provider";
  humanOnly?: boolean;
  readOnly?: boolean;
  openWorld?: boolean;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

// Shared state every tool group is bound to: the acting user, and how a new
// artifact resolves the matter it lands in. Each group builder takes this and
// returns its ToolSpec[]; buildToolCatalog assembles them.
export type ToolContext = {
  actor: Actor;
  /** Resolve the matter a new artifact lands in, or null when forbidden. */
  resolveMatter: (matterId?: string) => Promise<string | null>;
};
