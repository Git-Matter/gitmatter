import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";

/**
 * Render a contract's current DOCX (with Word tracked changes) client-side.
 * `versionToken` changes whenever a new version is written (propose/resolve),
 * triggering a re-fetch + re-render so the redline stays current.
 */
export function DocxView({ url, versionToken }: { url: string; versionToken: string | null }) {
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
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render document");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, versionToken]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  return <div ref={container} className="docx-view overflow-x-auto text-sm" />;
}
