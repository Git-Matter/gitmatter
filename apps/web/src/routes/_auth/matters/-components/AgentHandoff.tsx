import { useState } from "react";
import { matterReviewPrompt, SUBSCRIPTION_WORKFLOW } from "@workspace/registry";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AgentHandoff({ matter }: { matter: { id: string; name: string } }) {
  const [copied, setCopied] = useState(false);
  const prompt = matterReviewPrompt(matter);
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success("Review prompt copied. Paste it into your connected assistant.");
    } catch {
      toast.error("Couldn't copy. Select the prompt below and copy it manually.");
    }
  }
  return (
    <details className="rounded-lg bg-muted/50 px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">Review with your own AI</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">{SUBSCRIPTION_WORKFLOW}</p>
        <textarea
          aria-label="Matter review prompt"
          readOnly
          value={prompt}
          rows={5}
          className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm"
        />
        <div className="flex items-center gap-4">
          <Button size="sm" onClick={() => void copy()}>
            {copied ? "Copy again" : "Copy review prompt"}
          </Button>
          <a href="/settings?tab=agents" className="text-sm underline underline-offset-4">
            Connect your assistant
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          Upload documents here first. Your assistant will save its work in this matter for you to
          review.
        </p>
      </div>
    </details>
  );
}
