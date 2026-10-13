import type { DocumentWordInspection } from "@workspace/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** The server supplies version-bound safety; this component makes no XML guesses. */
export function WordInspectionNotice({
  inspection,
}: {
  inspection: DocumentWordInspection | null | undefined;
}) {
  if (!inspection)
    return (
      <Alert>
        <AlertTitle>Word inspection unavailable</AlertTitle>
        <AlertDescription>
          Revision coverage has not been established for this source. Keep the original file and
          inspect it in Word before relying on a clean output.
        </AlertDescription>
      </Alert>
    );
  const { inspection: metadata } = inspection;
  const blocked = !inspection.safeToEdit;
  const unsupported =
    metadata.revisions.moves + metadata.revisions.formatting + metadata.revisions.other > 0;
  return (
    <Alert variant={blocked ? "destructive" : "default"}>
      <AlertTitle>
        {metadata.status !== "complete"
          ? "Word inspection incomplete"
          : inspection.incomingRevisions
            ? "Incoming Word revisions detected"
            : unsupported || metadata.reasons.length
              ? "Word source coverage is limited"
              : inspection.registeredRevisions
                ? "Tracked draft with recorded proposals"
                : "No Word revisions detected"}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>
          {metadata.status !== "complete"
            ? "This source could not be fully inspected. No clean-file claim is available."
            : `${metadata.revisions.insertions} insertion and ${metadata.revisions.deletions} deletion markers detected across the document body, headers, footers, notes, comments and other document parts.${unsupported ? " Move, formatting or other unsupported revision markers are also present." : ""}`}
        </p>
        {blocked && (
          <p>
            Inspect the revisions and unsupported content in Word, then upload a supported source.
            Tracked editing, acceptance or rejection of Word changes, and clean export are blocked
            here. The original file is preserved; finding decisions remain separate.
          </p>
        )}
        <p>
          Review text{" "}
          {metadata.textView === "limited_body"
            ? "is a limited body view"
            : "uses supported body paragraphs in the accepted view"}
          : insertions are included and deletions are omitted. Headers, footers, notes, comments,
          formatting and layout are outside the review text. The rendered preview may differ; this
          text view does not accept Word revisions.
        </p>
        <p className="text-xs">
          Inspection bound to source version {inspection.versionId.slice(0, 8)}.
        </p>
      </AlertDescription>
    </Alert>
  );
}
