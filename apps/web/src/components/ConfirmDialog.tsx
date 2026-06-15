import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export type ConfirmStatus = "idle" | "loading" | "complete";

export function ConfirmDialog({
  open,
  title,
  message,
  description,
  confirmLabel = "Confirm",
  confirmStatus,
  pending = false,
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
  onConfirm: () => void;
  onCancel?: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const status = confirmStatus ?? (pending ? "loading" : "idle");
  const detail = message ?? description;

  function close() {
    if (onCancel) onCancel();
    else onOpenChange?.(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange?.(next);
        else close();
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-sm gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-heading text-base font-medium">{title}</h2>
          {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={close} disabled={status === "loading"}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={status !== "idle"}>
            {status === "complete" ? (
              <Check className="size-4" />
            ) : status === "loading" ? (
              "Working..."
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
