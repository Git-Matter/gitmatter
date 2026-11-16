import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActivityPanel } from "./activity-context";
import { ActivityTimeline } from "./StepsTimeline";

/**
 * Recorded activity stays beside a wide conversation, or in a named overlay on
 * narrow/matter workspaces. Returns null when closed.
 */
export function ActivityPanel({ forceOverlay = false }: { forceOverlay?: boolean }) {
  const ctx = useActivityPanel();
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  if (!ctx?.state) return null;
  if (forceOverlay || !wide)
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) ctx.close();
        }}
      >
        <SheetContent showCloseButton={false}>
          <header className="flex items-center justify-between border-b border-border p-4">
            <SheetTitle>Activity</SheetTitle>
            <SheetDescription className="sr-only">
              Inspect recorded steps and linked sources.
            </SheetDescription>
            <Button variant="ghost" size="icon-sm" aria-label="Close activity" onClick={ctx.close}>
              <X />
            </Button>
          </header>
          <div className="min-h-0 space-y-4 overflow-auto p-4">
            <ActivityTimeline
              steps={ctx.state.steps}
              onOpenSource={(source) => {
                const openSource = ctx.state?.onOpenSource;
                ctx.close();
                openSource?.(source);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    );
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
