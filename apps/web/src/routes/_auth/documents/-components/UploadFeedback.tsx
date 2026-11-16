import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UnsavedNavigationGuard } from "@/components/UnsavedChangesGuard";
import { canRetryUpload, type UploadResult } from "../-hooks/useDocumentUpload";

const labels: Record<UploadResult["status"], string> = {
  waiting: "Waiting",
  uploading: "Uploading…",
  uploaded: "Upload confirmed",
  failed: "Upload rejected",
  unconfirmed: "Result not confirmed",
  not_attempted: "Not attempted",
  unsupported: "Unsupported file type",
};

/** Per-file outcomes are local recovery state; accepting a file is not completed extraction. */
export function UploadFeedback({
  results,
  uploading,
  blocked,
  onRetry,
  onDismiss,
}: {
  results: UploadResult[];
  uploading: boolean;
  blocked: boolean;
  onRetry: (id: number) => void;
  onDismiss: () => void;
}) {
  const [retrying, setRetrying] = useState<UploadResult | null>(null);
  const resultRegion = useRef<HTMLElement>(null);
  const confirmed = results.filter((item) => item.status === "uploaded").length;
  const unresolved = results.some((item) => item.file !== null && item.status !== "uploaded");
  const uncertain = results.some((item) => item.status === "unconfirmed");
  const rejected = results.filter(
    (item) => item.status === "failed" || item.status === "unsupported"
  ).length;
  const unconfirmed = results.filter((item) => item.status === "unconfirmed").length;
  const notAttempted = results.filter(
    (item) => item.status === "not_attempted" || item.status === "waiting"
  ).length;
  return (
    <>
      <UnsavedNavigationGuard
        isDirty={() => uploading || unresolved}
        saving={uploading}
        pendingTitle="Upload in progress"
        pendingDescription="Wait for the sent upload to finish. Leaving does not cancel a request that has already been sent."
        description="Some files still need attention. Leaving discards this local retry list; files already accepted remain uploaded."
        onDiscard={onDismiss}
      />
      {!!results.length && (
        <section
          ref={resultRegion}
          tabIndex={-1}
          aria-label="Upload results"
          className="flex min-h-0 shrink-0 flex-col gap-2"
        >
          <Alert role="status" aria-live="polite">
            <AlertTitle>
              {confirmed} of {results.length} uploads confirmed{uploading ? " · Uploading…" : ""}
            </AlertTitle>
            <AlertDescription>
              <p>
                {rejected} rejected · {unconfirmed} unconfirmed · {notAttempted} not attempted
              </p>
              <p>
                {uncertain
                  ? "A sent request has an unknown result. Check the documents list below before retrying that file to avoid submitting it twice."
                  : "Extraction may still be processing. Failed and unattempted files stay here until you retry or clear the results."}
              </p>
            </AlertDescription>
          </Alert>
          <ul
            className="flex max-h-44 flex-col divide-y overflow-y-auto"
            aria-label="Per-file upload outcomes"
          >
            {results.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{labels[item.status]}</p>
                  {item.error && (
                    <p className="text-sm break-words text-muted-foreground">{item.error}</p>
                  )}
                </div>
                {canRetryUpload(item) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploading || blocked}
                    aria-label={`${item.status === "unconfirmed" ? "Review unconfirmed upload" : "Retry upload"}: ${item.name}`}
                    onClick={() =>
                      item.status === "unconfirmed" ? setRetrying(item) : onRetry(item.id)
                    }
                  >
                    {item.status === "unconfirmed" ? "Review retry" : "Retry"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={uploading}
            onClick={onDismiss}
          >
            Clear upload results
          </Button>
        </section>
      )}
      <Dialog
        open={retrying !== null}
        onOpenChange={(next) => {
          if (!next) setRetrying(null);
        }}
      >
        <DialogContent finalFocus={resultRegion} className="sm:max-w-md md:max-w-md lg:max-w-md">
          <DialogHeader>
            <DialogTitle>Retry an unconfirmed upload?</DialogTitle>
            <DialogDescription>
              This file may already have been accepted. Check the documents list first. Retrying can
              upload it a second time.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium break-words">{retrying?.name}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetrying(null)}>
              Keep result
            </Button>
            <Button
              disabled={uploading || blocked}
              onClick={() => {
                if (retrying) onRetry(retrying.id);
                setRetrying(null);
              }}
            >
              Retry anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
