import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Cloudflare Turnstile widget (vanilla script, explicit render). Mounted on the
// auth forms; the token it emits is sent as the `x-captcha-response` header and
// verified server-side by better-auth's captcha plugin.
//
// Gated on the public site key: when VITE_TURNSTILE_SITE_KEY is unset (local
// dev) the widget renders nothing and `turnstileEnabled` is false, so the forms
// submit without a captcha — matching the server, which only enforces when the
// secret is set.

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

/** True when a site key is configured, so the forms know to require a token. */
export const turnstileEnabled = Boolean(SITE_KEY);

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    }
  ) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Load the Turnstile script once and share the promise across mounts.
let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      s.remove();
      scriptPromise = null;
      reject(new Error("Failed to load Turnstile"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Re-mount this component (via a changing `key`) to get a fresh challenge after
// a failed submit — Turnstile tokens are single-use.
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Hold the latest callback in a ref so the mount effect can stay one-shot.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return;
    onTokenRef.current(null);
    let widgetId: string | null = null;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => {
            setError(null);
            onTokenRef.current(token);
          },
          "expired-callback": () => {
            onTokenRef.current(null);
            setError("Security check expired. Try it again.");
          },
          "error-callback": () => {
            onTokenRef.current(null);
            setError("Security check could not finish. Try it again.");
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        onTokenRef.current(null);
        setError("Security check could not load. Check your connection and retry.");
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [attempt]);

  if (!SITE_KEY) return null;
  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="flex justify-center" />
      {error && (
        <div role="status" className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}
          >
            Retry security check
          </Button>
        </div>
      )}
    </div>
  );
}
