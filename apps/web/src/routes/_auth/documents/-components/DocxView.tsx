import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { cn } from "@/lib/util/utils";

/**
 * Render a document's current DOCX (with Word tracked changes) client-side.
 * `versionToken` changes whenever a new version is written (propose/resolve),
 * triggering a re-fetch + re-render so the redline stays current.
 */
export function DocxView({
  url,
  versionToken,
  preserveLayout = false,
}: {
  url: string;
  versionToken: string | null;
  preserveLayout?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Could not load document");
        const blob = await res.blob();
        if (cancelled || !container.current) return;
        container.current.innerHTML = "";
        await renderAsync(blob, container.current, undefined, {
          inWrapper: true,
          renderChanges: true, // show w:ins / w:del tracked-change markup
          // Flow the page to the container width instead of a fixed A4 width,
          // so it never overflows / clips inside a narrow preview pane.
          ignoreWidth: !preserveLayout,
          ignoreHeight: !preserveLayout,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render document");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, versionToken, preserveLayout]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  // Tame docx-preview's chrome: drop its gray wrapper bg + heavy padding and the
  // page shadow so it blends into the pane and reads as a clean sheet.
  return (
    <div
      ref={container}
      className={cn(
        "docx-view text-sm [&_.docx]:mx-auto [&_.docx]:bg-card [&_.docx]:shadow-none [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-0",
        preserveLayout ? "w-max min-w-full" : "[&_.docx]:w-full"
      )}
    />
  );
}
