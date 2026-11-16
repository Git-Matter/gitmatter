import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function ResponseNotice({ outcome, error }: { outcome: string; error: string | null }) {
  if (outcome !== "failed" && outcome !== "stopped") return null;
  return (
    <Alert>
      <AlertTitle>{outcome === "stopped" ? "Response stopped" : "Response incomplete"}</AlertTitle>
      <AlertDescription>
        {error && <p>{error}</p>}
        <p>
          The original request and any partial output remain in this view. Check them before sending
          again. Another request can incur provider usage; recorded changes remain in history.
        </p>
      </AlertDescription>
    </Alert>
  );
}
