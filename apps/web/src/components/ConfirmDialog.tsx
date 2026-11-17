import { useEffect, useRef, useState } from "react";
import { UnsavedNavigationGuard } from "./UnsavedChangesGuard";
import { FormFeedback } from "./FormFeedback";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export type ConfirmStatus = "idle" | "loading" | "complete";

export function ConfirmDialog({
  open,
  title,
  message,
  description,
  confirmLabel = "Confirm",
  confirmStatus,
  pending = false,
  error,
  onConfirm,
  onCancel,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  message?: string;
  description?: string;
  confirmLabel?: string;
  confirmStatus?: ConfirmStatus;
  pending?: boolean;
  error?: unknown;
  onConfirm: () => void | Promise<unknown>;
  onCancel?: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const status = confirmStatus ?? (pending ? "loading" : "idle");
  const detail = message ?? description;
  const request = useRef(false);
  const [starting, setStarting] = useState(false);
  const [requestError, setRequestError] = useState<unknown>(null);
  useEffect(() => {
    setRequestError(null);
  }, [open, title, detail]);
  const working = open && status !== "complete" && (starting || status === "loading");
  const inFlight = () => open && status !== "complete" && (request.current || status === "loading");
  async function confirm() {
    if (!open || request.current || status !== "idle") return;
    request.current = true;
    setStarting(true);
    setRequestError(null);
    try {
      await onConfirm();
    } catch (error) {
      setRequestError(error);
    } finally {
      request.current = false;
      setStarting(false);
    }
  }

  function close() {
    if (inFlight()) return;
    if (onCancel) onCancel();
    else onOpenChange?.(false);
  }

  return (
    <>
      <UnsavedNavigationGuard
        isDirty={inFlight}
        saving={working}
        pendingTitle="Action in progress"
        pendingDescription="This action has already been sent. Wait for its result before leaving."
      />
      <Dialog
        disablePointerDismissal
        open={open}
        onOpenChange={(next, details) => {
          if (next) {
            onOpenChange?.(next);
            return;
          }
          if (inFlight() || (details.reason !== "escape-key" && details.reason !== "close-press")) {
            details.cancel();
            return;
          }
          close();
        }}
      >
        <DialogContent showCloseButton={!working} className="max-w-sm gap-4">
          <div className="flex flex-col gap-1.5">
            <DialogTitle className="font-heading text-base font-medium">{title}</DialogTitle>
            {detail && (
              <DialogDescription className="text-sm text-muted-foreground">
                {detail}
              </DialogDescription>
            )}
          </div>
          <FormFeedback error={error || requestError} title="Action was not completed" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={close} disabled={working}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void confirm()}
              disabled={working || status !== "idle"}
            >
              {status === "complete" ? (
                <Check className="size-4" />
              ) : working ? (
                `${confirmLabel} in progress…`
              ) : (
                confirmLabel
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
