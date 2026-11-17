import type { ChatAttachment } from "@/lib/data/api";

export type WorkflowChatSeed = { steps: string[]; attachments: ChatAttachment[] };

/** Accept legacy workflow seeds, but reject malformed or unknown versions whole. */
export function parseWorkflowChatSeed(value: unknown): WorkflowChatSeed | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const seed = value as Record<string, unknown>;
  if (seed.version !== undefined && seed.version !== 1) return null;
  if (
    !Array.isArray(seed.steps) ||
    !seed.steps.length ||
    seed.steps.length > 25 ||
    !seed.steps.every(
      (step) => typeof step === "string" && step.trim().length > 0 && step.length <= 20000
    )
  )
    return null;
  if (seed.attachments !== undefined && !Array.isArray(seed.attachments)) return null;
  const attachments = (seed.attachments ?? []) as unknown[];
  if (
    !attachments.every((value) => {
      if (!value || typeof value !== "object") return false;
      const attachment = value as Record<string, unknown>;
      return (
        typeof attachment.kind === "string" &&
        ["document", "matter", "client", "review"].includes(attachment.kind) &&
        typeof attachment.id === "string" &&
        attachment.id.length > 0 &&
        typeof attachment.label === "string" &&
        (attachment.status === undefined ||
          (typeof attachment.status === "string" &&
            ["pending", "processing", "ready", "failed"].includes(attachment.status)))
      );
    })
  )
    return null;
  return { steps: seed.steps as string[], attachments: attachments as ChatAttachment[] };
}
