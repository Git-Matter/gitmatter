import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export type ConfirmStatus = "idle" | "loading" | "complete";

// Small confirm/cancel dialog with an inline action status, used for destructive
// workflow actions (delete).
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  confirmStatus = "idle",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  confirmStatus?: ConfirmStatus;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent showCloseButton={false} className="max-w-sm gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-heading text-base font-medium">{title}</h2>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={confirmStatus === "loading"}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={confirmStatus !== "idle"}
          >
            {confirmStatus === "complete" ? (
              <Check className="size-4" />
            ) : confirmStatus === "loading" ? (
              "Working…"
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
