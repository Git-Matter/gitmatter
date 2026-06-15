import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ModalSize = "sm" | "md" | "lg" | "xl";

export type ModalAction = {
  label: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  form?: string;
  variant?: "primary" | "secondary" | "danger";
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  breadcrumbs?: ReactNode[];
  size?: ModalSize;
  className?: string;
  footerStatus?: ReactNode;
  primaryAction?: ModalAction;
  secondaryAction?: ModalAction;
  cancelAction?: ModalAction | false;
}

// Force the chosen width past DialogContent's responsive defaults (md/lg).
const sizeClassName: Record<ModalSize, string> = {
  sm: "md:max-w-md lg:max-w-md",
  md: "md:max-w-xl lg:max-w-xl",
  lg: "md:max-w-2xl lg:max-w-2xl",
  xl: "md:max-w-3xl lg:max-w-4xl",
};

function actionButton(action: ModalAction, fallback: "primary" | "secondary" | "cancel") {
  const variant = action.variant ?? (fallback === "cancel" ? "secondary" : fallback);
  const buttonVariant =
    variant === "primary" ? "default" : variant === "danger" ? "destructive" : "outline";
  return (
    <Button
      type={action.type ?? "button"}
      form={action.form}
      variant={buttonVariant}
      size="sm"
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.icon}
      {action.label}
    </Button>
  );
}

// Faithful re-creation of mike's shared Modal (breadcrumb header, scrolling body,
// footer with secondary/status/cancel/primary actions) on gitcounsel's Dialog.
export function WorkflowModal({
  open,
  onClose,
  children,
  breadcrumbs,
  size = "lg",
  className,
  footerStatus,
  primaryAction,
  secondaryAction,
  cancelAction,
}: ModalProps) {
  const hasFooter =
    !!footerStatus || !!primaryAction || !!secondaryAction || cancelAction !== false;
  const resolvedCancel =
    cancelAction === undefined && primaryAction
      ? { label: "Cancel", onClick: onClose }
      : cancelAction;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton
        className={cn(
          "flex h-[600px] max-h-[85vh] w-full flex-col gap-0 p-0",
          sizeClassName[size],
          className
        )}
      >
        {breadcrumbs?.length ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-6 py-4 pe-12 text-xs text-muted-foreground">
            {breadcrumbs.map((segment, index) => (
              <span key={index} className="flex items-center gap-1.5">
                {index > 0 && <span className="text-border">›</span>}
                <span className="truncate">{segment}</span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6">{children}</div>

        {hasFooter && (
          <div
            className={cn(
              "flex items-center gap-3 border-t border-border p-3",
              secondaryAction ? "justify-between" : "justify-end"
            )}
          >
            {secondaryAction && (
              <div className="flex min-w-0 items-center gap-2">
                {actionButton(secondaryAction, "secondary")}
              </div>
            )}
            <div className="flex items-center gap-2">
              {footerStatus}
              {resolvedCancel && actionButton(resolvedCancel, "cancel")}
              {primaryAction && actionButton(primaryAction, "primary")}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
