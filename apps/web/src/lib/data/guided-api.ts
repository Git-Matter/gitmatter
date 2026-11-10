import type { GuidedSample, GuidedTaskInput, PreparedGuidedTask } from "@workspace/registry";

async function post<T>(path: string, input?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not prepare the guided task. Please try again.");
  }
  return response.json() as Promise<T>;
}

export const guidedApi = {
  sample: () => post<GuidedSample>("/api/guided/sample"),
  prepare: (input: GuidedTaskInput) => post<PreparedGuidedTask>("/api/guided/prepare", input),
};
