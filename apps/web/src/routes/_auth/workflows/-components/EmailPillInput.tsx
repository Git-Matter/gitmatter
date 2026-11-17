import { Input } from "@/components/ui/input";
import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/util/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_KEYS = new Set(["Enter", ","]);

interface WorkflowEmailInputProps {
  emails: string[];
  onChange: (emails: string[]) => void;
  validate?: (email: string) => Promise<string | null>;
  onValidatingChange?: (validating: boolean) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function EmailPillInput(props: WorkflowEmailInputProps) {
  const emails = props.emails;
  const placeholder = props.placeholder ?? "Add by email...";
  const autoFocus = props.autoFocus ?? false;
  const input = useEmailInput({
    emails,
    onChange: props.onChange,
    onValidatingChange: props.onValidatingChange,
    validate: props.validate,
  });

  return (
    <div>
      <div
        className={cn(
          "flex min-h-10 flex-wrap gap-1.5 rounded-md border bg-background px-3 py-2 transition-colors",
          input.error
            ? "border-destructive/50 focus-within:border-destructive"
            : "border-input focus-within:border-ring"
        )}
      >
        {emails.map((email) => (
          <EmailPill key={email} email={email} onRemove={input.removeEmail} />
        ))}
        <Input
          type="email"
          value={input.value}
          onChange={(event) => input.setValue(event.target.value)}
          onKeyDown={input.handleKeyDown}
          onBlur={() => void input.addEmail()}
          placeholder={emails.length === 0 ? placeholder : ""}
          className="min-w-[160px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          autoFocus={autoFocus}
        />
      </div>
      <EmailInputStatus error={input.error} validating={input.validating} />
    </div>
  );
}

function useEmailInput({
  emails,
  onChange,
  validate,
  onValidatingChange,
}: Pick<WorkflowEmailInputProps, "emails" | "onChange" | "onValidatingChange" | "validate">) {
  const [input, setInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setValidatingState(isValidating: boolean) {
    setValidating(isValidating);
    onValidatingChange?.(isValidating);
  }

  function clearInput() {
    setInput("");
    setError(null);
  }

  function setValue(value: string) {
    setInput(value);
    setError(null);
  }

  function removeEmail(email: string) {
    onChange(emails.filter((currentEmail) => currentEmail !== email));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (EMAIL_KEYS.has(event.key)) {
      event.preventDefault();
      void addEmail();
      return;
    }

    if (event.key === "Backspace" && !input && emails.length > 0) {
      onChange(emails.slice(0, -1));
    }
  }

  async function addEmail() {
    const email = normalizeEmail(input);
    if (!email) return;
    if (emails.includes(email)) {
      clearInput();
      return;
    }
    const validationError = await getEmailError(email, validate, setValidatingState);
    if (validationError) {
      setError(validationError);
      return;
    }

    onChange([...emails, email]);
    clearInput();
  }

  return {
    addEmail,
    error,
    handleKeyDown,
    removeEmail,
    setValue,
    validating,
    value: input,
  };
}

async function getEmailError(
  email: string,
  validate: WorkflowEmailInputProps["validate"],
  setValidatingState: (validating: boolean) => void
) {
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
  if (!validate) return null;

  setValidatingState(true);
  try {
    return await validate(email);
  } catch {
    return "Could not verify email. Try again.";
  } finally {
    setValidatingState(false);
  }
}

function EmailPill({ email, onRemove }: { email: string; onRemove: (email: string) => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">
      {email}
      <button
        type="button"
        onClick={() => onRemove(email)}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function EmailInputStatus({ error, validating }: { error: string | null; validating: boolean }) {
  if (error) return <p className="mt-1.5 text-xs text-destructive">{error}</p>;
  if (validating) return <p className="mt-1.5 text-xs text-muted-foreground">Checking...</p>;
  return null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
