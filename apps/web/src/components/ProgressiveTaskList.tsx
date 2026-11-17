import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Recommendation = { number: number; title: string };
const TaskListContext = createContext<{
  expanded: number | null;
  recommendation: Recommendation | null;
  continueTask: () => void;
} | null>(null);

/** Recommendations are facts; expansion is user state. Polling never replaces the latter. */
export function ProgressiveTaskList({
  label,
  recommendation,
  children,
}: {
  label: string;
  recommendation: Recommendation | null;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState<number | null>(recommendation?.number ?? null);
  const listRef = useRef<HTMLOListElement>(null);

  function continueTask() {
    if (!recommendation) return;
    setExpanded(recommendation.number);
    requestAnimationFrame(() => {
      const trigger = listRef.current?.querySelector<HTMLButtonElement>(
        `[data-task-step="${recommendation.number}"] [data-slot="accordion-trigger"]`
      );
      trigger?.focus();
      trigger?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  }

  return (
    <TaskListContext.Provider value={{ expanded, recommendation, continueTask }}>
      <div className="flex flex-col gap-4">
        {recommendation ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3">
            <p className="text-sm" role="status">
              <span className="font-medium">Suggested next task:</span> {recommendation.title}
            </p>
            {expanded === null ? (
              <Button variant="outline" size="sm" onClick={continueTask}>
                Continue: {recommendation.title}
              </Button>
            ) : null}
          </div>
        ) : null}
        <Accordion
          render={<ol ref={listRef} aria-label={label} />}
          value={expanded === null ? [] : [expanded]}
          onValueChange={(values) => setExpanded(values[0] ?? null)}
        >
          {children}
        </Accordion>
      </div>
    </TaskListContext.Provider>
  );
}

export function ProgressiveTaskStep({
  number,
  title,
  state,
  children,
}: {
  number: number;
  title: string;
  state: string;
  children: ReactNode;
}) {
  const taskList = useContext(TaskListContext);
  const next = taskList?.recommendation;
  return (
    <AccordionItem value={number} render={<li />} data-task-step={number}>
      <AccordionTrigger headingLevel={2} className="min-h-12 items-center gap-3 hover:no-underline">
        <span className="flex flex-1 flex-wrap items-center justify-between gap-2">
          <span className="font-medium">
            {number}. {title}
          </span>
          <Badge variant="secondary">{state}</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent
        keepMounted
        inert={taskList?.expanded !== number}
        className="flex max-w-prose flex-col items-start gap-3 text-muted-foreground [&_p:not(:last-child)]:mb-0"
      >
        {children}
        {taskList?.expanded === number && next && next.number !== number ? (
          <Button variant="outline" size="sm" onClick={taskList.continueTask}>
            Continue: {next.title}
          </Button>
        ) : null}
      </AccordionContent>
    </AccordionItem>
  );
}
