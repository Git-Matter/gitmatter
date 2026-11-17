import { useEffect, useRef, useState } from "react";
import { DiscardChangesDialog, UnsavedNavigationGuard } from "@/components/UnsavedChangesGuard";

/** Modal close and route exit use the same keep/discard policy. */
export function useDraftExit({
  dirty,
  saving = false,
  discard,
  committed,
  pendingTitle,
  pendingDescription,
}: {
  dirty: boolean;
  saving?: boolean;
  discard: () => void;
  committed?: { current: boolean };
  pendingTitle?: string;
  pendingDescription?: string;
}) {
  const ownCommitted = useRef(false);
  const resolved = committed ?? ownCommitted;
  const [close, setClose] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!dirty && !saving) {
      resolved.current = false;
      if (close) setClose(null);
    }
  }, [close, dirty, saving, resolved]);
  return {
    resolve() {
      resolved.current = true;
      setClose(null);
    },
    requestClose(action: () => void) {
      if (!resolved.current && (dirty || saving)) {
        setClose(() => action);
        return false;
      }
      action();
      return true;
    },
    guard: (
      <>
        <UnsavedNavigationGuard
          isDirty={() => !resolved.current && (dirty || saving)}
          saving={saving}
          pendingTitle={pendingTitle}
          pendingDescription={pendingDescription}
          onDiscard={discard}
        />
        <DiscardChangesDialog
          open={!!close}
          saving={saving}
          pendingTitle={pendingTitle}
          pendingDescription={pendingDescription}
          onKeep={() => setClose(null)}
          onDiscard={() => {
            discard();
            const action = close;
            setClose(null);
            action?.();
          }}
        />
      </>
    ),
  };
}
