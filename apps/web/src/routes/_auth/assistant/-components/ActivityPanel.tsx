import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActivityPanel } from "./activity-context";
import { ActivityTimeline } from "./StepsTimeline";

/**
 * Right-side activity panel. Rendered as a flex sibling of the conversation so
 * it PUSHES the chat aside (no overlay/scrim). Returns null when closed.
 */
export function ActivityPanel() {
  const ctx = useActivityPanel();
  if (!ctx?.state) return null;
  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-s border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-heading font-medium">Activity</h2>
        <Button variant="ghost" size="icon-sm" onClick={ctx.close} title="Close activity">
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <ActivityTimeline steps={ctx.state.steps} onOpenSource={ctx.state.onOpenSource} />
      </div>
    </aside>
  );
}
