import type { GuidedSample, GuidedTaskInput, PreparedGuidedTask } from "@workspace/registry";
import { apiRequest } from "./api";

async function post<T>(path: string, input?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
}

export const guidedApi = {
  sample: () => post<GuidedSample>("/api/guided/sample"),
  prepare: (input: GuidedTaskInput) => post<PreparedGuidedTask>("/api/guided/prepare", input),
};
