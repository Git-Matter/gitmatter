import { cn } from "@/lib/util/utils";
import type { ReactNode } from "react";

/**
 * Route layout. The shell <main> (see __root.tsx) is height-bounded and does
 * NOT scroll; each page is a flex column where the header stays fixed and the
 * body owns the scroll. This is why routes no longer need h-[calc(100dvh-…)]
 * viewport math — height cascades through the flex chain.
 *
 * mode:
 *  - "scroll" (default): the body scrolls vertically. Forms, prose, card lists.
 *  - "fill": the body fills without scrolling so a single child owns the scroll
 *    itself (e.g. DataTable, Conversation). That child must be `min-h-0 flex-1`.
 *
 * Header↔body spacing is fixed at one `stack` so vertical rhythm stays uniform
 * across every route.
 */
export function PageShell({
  header,
  children,
  mode = "scroll",
  className,
  bodyClassName,
}: {
  header?: ReactNode;
  children: ReactNode;
  mode?: "scroll" | "fill";
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-stack", className)}>
      {header && (
        <div className="flex min-h-chrome shrink-0 flex-col justify-center border-b border-border pb-4">
          {header}
        </div>
      )}
      <div
        className={cn(
          "min-h-0 flex-1",
          mode === "scroll" ? "overflow-y-auto" : "flex flex-col",
          bodyClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
