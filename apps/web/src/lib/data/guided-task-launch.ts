import { GUIDED_TASK_IDS, type GuidedTaskId } from "@workspace/registry";

const GUIDED_TASK_TO_OPEN = "guidedTaskToOpen";

type LaunchStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function queueGuidedTaskLaunch(storage: LaunchStorage, task: GuidedTaskId) {
  // A previous legacy seed must not start a model call behind the guided dialog.
  storage.removeItem("workflowChatSeed");
  storage.setItem(GUIDED_TASK_TO_OPEN, JSON.stringify({ version: 1, task }));
}

export function clearGuidedTaskLaunch(storage: LaunchStorage) {
  storage.removeItem(GUIDED_TASK_TO_OPEN);
}

/** Consume once. This requests a dialog only, never a prompt or a model call. */
export function consumeGuidedTaskLaunch(storage: LaunchStorage): GuidedTaskId | null {
  try {
    const raw = storage.getItem(GUIDED_TASK_TO_OPEN);
    if (raw === null) return null;
    storage.removeItem(GUIDED_TASK_TO_OPEN);
    if (raw.length > 200) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const seed = value as Record<string, unknown>;
    if (
      seed.version !== 1 ||
      Object.keys(seed).some((key) => key !== "version" && key !== "task") ||
      typeof seed.task !== "string" ||
      !GUIDED_TASK_IDS.includes(seed.task as GuidedTaskId)
    )
      return null;
    return seed.task as GuidedTaskId;
  } catch {
    return null;
  }
}
