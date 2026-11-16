import { describe, expect, test } from "vite-plus/test";
import { GUIDED_TASKS, guidedTaskForSystemWorkflow } from "@workspace/registry";
import { consumeGuidedTaskLaunch, queueGuidedTaskLaunch } from "./guided-task-launch";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("built-in guided task launch", () => {
  test("only the three known system assistant templates open guided tasks", () => {
    for (const task of GUIDED_TASKS) {
      const workflow = { title: task.workflowTitle, type: "assistant", isSystem: true };
      expect(guidedTaskForSystemWorkflow(workflow)).toBe(task.id);
      expect(guidedTaskForSystemWorkflow({ ...workflow, isSystem: false })).toBeNull();
      expect(guidedTaskForSystemWorkflow({ ...workflow, type: "tabular" })).toBeNull();
    }
    expect(
      guidedTaskForSystemWorkflow({ title: "Contract Summary", type: "assistant", isSystem: true })
    ).toBeNull();
  });

  test("opens the selected dialog once and discards an older auto-send seed", () => {
    const browserStorage = storage({ workflowChatSeed: JSON.stringify({ steps: ["Do not run"] }) });
    queueGuidedTaskLaunch(browserStorage, "client-update");
    expect(browserStorage.getItem("workflowChatSeed")).toBeNull();
    expect(consumeGuidedTaskLaunch(browserStorage)).toBe("client-update");
    expect(consumeGuidedTaskLaunch(browserStorage)).toBeNull();
  });

  test("discards malformed, unknown, and prompt-bearing seeds without opening a task", () => {
    for (const raw of [
      "not json",
      "null",
      "[]",
      JSON.stringify({ version: 2, task: "client-update" }),
      JSON.stringify({ version: 1, task: "unknown" }),
      JSON.stringify({ version: 1, task: "client-update", prompt: "Do not run" }),
      "x".repeat(201),
    ]) {
      const browserStorage = storage({ guidedTaskToOpen: raw });
      expect(consumeGuidedTaskLaunch(browserStorage)).toBeNull();
      expect(browserStorage.getItem("guidedTaskToOpen")).toBeNull();
    }
  });
});
