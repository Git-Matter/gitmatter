import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { GUIDED_TASKS, type GuidedTaskId, type PreparedGuidedTask } from "@workspace/registry";
import { GuidedTaskDialog } from "./GuidedTaskDialog";
import { consumeGuidedTaskLaunch } from "@/lib/data/guided-task-launch";

export function GuidedStarts({ onStart }: { onStart: (seed: PreparedGuidedTask) => void }) {
  const [task, setTask] = useState<GuidedTaskId | null>(null);
  useEffect(() => {
    const requestedTask = consumeGuidedTaskLaunch(sessionStorage);
    if (requestedTask) setTask(requestedTask);
  }, []);
  return (
    <section className="w-full" aria-label="Guided legal work">
      <div className="divide-y divide-border">
        {GUIDED_TASKS.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setTask(item.id)}
            className="group flex w-full items-center gap-4 rounded-md px-3 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="flex-1">
              <span className="block font-medium">{item.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
            </span>
            <ArrowUpRight
              className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {task ? (
        <GuidedTaskDialog
          key={task}
          taskId={task}
          onClose={() => setTask(null)}
          onStart={onStart}
        />
      ) : null}
    </section>
  );
}
