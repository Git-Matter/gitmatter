import { toast } from "sonner";

export const actionFeedbackEvent = "gitmatter:action-result";
export type ActionSection =
  | "Clients"
  | "Matters"
  | "Documents"
  | "Reviews"
  | "Workflows"
  | "Library"
  | "Settings"
  | "Assistant"
  | "Workspace";
export type ActionOrigin = { section: ActionSection };
export type ActionResult = ActionOrigin & { message: string };

/** Capture before awaiting work so a later route cannot rename its origin. */
export function captureActionOrigin(): ActionOrigin {
  const sections: Record<string, ActionSection> = {
    clients: "Clients",
    matters: "Matters",
    documents: "Documents",
    reviews: "Reviews",
    workflows: "Workflows",
    library: "Library",
    settings: "Settings",
    assistant: "Assistant",
  };
  const segment = typeof window === "undefined" ? "" : window.location.pathname.split("/")[1];
  return { section: sections[segment] ?? "Workspace" };
}

/** Keep a confirmed action result in the workspace; standalone surfaces retain Sonner. */
export function notifySuccess(message: string, origin: ActionOrigin = captureActionOrigin()) {
  if (typeof window !== "undefined") {
    const event = new CustomEvent<ActionResult>(actionFeedbackEvent, {
      cancelable: true,
      detail: { message, section: origin.section },
    });
    if (!window.dispatchEvent(event)) return;
  }
  toast.success(message);
}
