import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Request failures stay with the form until the next deliberate attempt. */
export function FormFeedback({
  error,
  title = "Changes were not saved",
  id,
}: {
  error: unknown;
  title?: string;
  id?: string;
}) {
  if (!error) return null;
  return (
    <Alert id={id} variant="destructive" role="alert">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "The request could not be confirmed."}{" "}
        Your input is retained. Correct the problem or try again.
      </AlertDescription>
    </Alert>
  );
}
