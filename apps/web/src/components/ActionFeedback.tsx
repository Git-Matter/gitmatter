import { useEffect, useState } from "react";
import { CircleCheck, X } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { actionFeedbackEvent, type ActionResult } from "@/lib/feedback";

/** One persistent, session-scoped receipt. No timeout, storage or focus movement. */
export function ActionFeedback() {
  const [result, setResult] = useState<ActionResult | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const message = event as CustomEvent<ActionResult>;
      setResult(message.detail);
      event.preventDefault();
    };
    window.addEventListener(actionFeedbackEvent, receive);
    return () => window.removeEventListener(actionFeedbackEvent, receive);
  }, []);
  // Keep the live region mounted so subsequent content changes can be announced politely.
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="shrink-0">
      {result && (
        <Alert role="presentation" className="mb-4">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>{result.message}</AlertTitle>
          <AlertDescription>Last successful action · {result.section}</AlertDescription>
          <AlertAction>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss action result"
              onClick={(event) => {
                const heading = event.currentTarget.closest("main")?.querySelector("h1");
                setResult(null);
                if (heading instanceof HTMLElement) {
                  const priorTabIndex = heading.getAttribute("tabindex");
                  heading.tabIndex = -1;
                  heading.focus({ preventScroll: true });
                  heading.addEventListener(
                    "blur",
                    () => {
                      if (priorTabIndex === null) heading.removeAttribute("tabindex");
                      else heading.setAttribute("tabindex", priorTabIndex);
                    },
                    { once: true }
                  );
                }
              }}
            >
              <X />
            </Button>
          </AlertAction>
        </Alert>
      )}
    </div>
  );
}
