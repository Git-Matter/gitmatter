import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";

/**
 * Render a document's current DOCX (with Word tracked changes) client-side.
 * `versionToken` changes whenever a new version is written (propose/resolve),
 * triggering a re-fetch + re-render so the redline stays current.
 */
export function DocxView({
  url,
  versionToken,
  onRendered,
}: {
  url: string;
  versionToken: string | null;
  onRendered?: (version: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setError(null);
    setLoading(true);
    onRendered?.(null);
    container.current?.replaceChildren();
    void (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error("Could not load document");
        const blob = await res.blob();
        if (cancelled || !container.current) return;
        // Render away from the visible pane so an obsolete async render cannot
        // replace a newer version after navigation or another edit.
        const rendered = document.createElement("div");
        await renderAsync(blob, rendered, undefined, {
          inWrapper: true,
          renderChanges: true, // show w:ins / w:del tracked-change markup
          // Flow the page to the container width instead of a fixed A4 width,
          // so it never overflows / clips inside a narrow preview pane.
          ignoreWidth: true,
          ignoreHeight: true,
        });
        if (cancelled || !container.current) return;
        container.current.replaceChildren(...Array.from(rendered.childNodes));
        setLoading(false);
        onRendered?.(versionToken);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to render document");
          setLoading(false);
          onRendered?.(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, versionToken, onRendered]);

  // Tame docx-preview's chrome: drop its gray wrapper bg + heavy padding and the
  // page shadow so it blends into the pane and reads as a clean sheet.
  return (
    <div className="flex flex-col gap-2">
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading this Word version…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div
        ref={container}
        aria-busy={loading}
        className="docx-view text-sm [&_.docx]:mx-auto [&_.docx]:w-full [&_.docx]:bg-card [&_.docx]:shadow-none [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-0"
      />
    </div>
  );
}
