import { toast } from "sonner";

export const actionFeedbackEvent = "gitmatter:action-result";
export type ActionResult = { message: string; section: string };

/** Keep a confirmed action result in the workspace; standalone surfaces retain Sonner. */
export function notifySuccess(message: string) {
  if (typeof window !== "undefined") {
    const segment = window.location.pathname.split("/")[1];
    const sections: Record<string, string> = {
      clients: "Clients",
      matters: "Matters",
      documents: "Documents",
      reviews: "Reviews",
      workflows: "Workflows",
      library: "Library",
      settings: "Settings",
      assistant: "Assistant",
    };
    const event = new CustomEvent<ActionResult>(actionFeedbackEvent, {
      cancelable: true,
      detail: { message, section: sections[segment] ?? "Workspace" },
    });
    if (!window.dispatchEvent(event)) return;
  }
  toast.success(message);
}
