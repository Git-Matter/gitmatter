import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useBlocker, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Copy = {
  title?: string;
  description?: string;
  saving?: boolean;
  pendingTitle?: string;
  pendingDescription?: string;
};
type NavigationOptions = {
  isDirty: () => boolean;
  onDiscard?: () => void;
  /** Only for pages that retain every draft while their search/hash changes. */
  allowSearchNavigation?: boolean;
};

type GuardSpec = Copy & NavigationOptions;
type Registry = { entries: Map<string, RefObject<GuardSpec>>; changed: () => void };
const GuardRegistry = createContext<Registry | null>(null);

/** One route/unload prompt covers all active forms in the workspace. */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [, setRevision] = useState(0);
  const registry = useMemo<Registry>(
    () => ({ entries: new Map(), changed: () => setRevision((value) => value + 1) }),
    []
  );
  const router = useRouter({ warn: false });
  const active = [...registry.entries.values()]
    .map((ref) => ref.current)
    .filter((spec) => spec.isDirty());
  const isDirty = () => [...registry.entries.values()].some((ref) => ref.current.isDirty());
  const copy = active.find((spec) => spec.saving) ?? active[0] ?? {};
  return (
    <GuardRegistry.Provider value={registry}>
      {children}
      <UnloadGuard isDirty={isDirty} />
      {router && (
        <RouterGuard
          {...copy}
          isDirty={isDirty}
          saving={active.some((spec) => spec.saving)}
          allowSearchNavigation={active.every((spec) => spec.allowSearchNavigation)}
          onDiscard={() => {
            for (const ref of registry.entries.values())
              if (ref.current.isDirty()) ref.current.onDiscard?.();
          }}
        />
      )}
    </GuardRegistry.Provider>
  );
}

export function DiscardChangesDialog({
  open,
  onKeep,
  onDiscard,
  title = "Keep your unsaved changes?",
  description = "Your changes are still here. Continue editing, or discard them deliberately.",
  saving = false,
  pendingTitle = "Saving your changes",
  pendingDescription = "A save is in progress. Wait for it to finish before leaving.",
}: Copy & { open: boolean; onKeep: () => void; onDiscard: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeep();
      }}
    >
      <DialogContent className="sm:max-w-md md:max-w-md lg:max-w-md">
        <DialogHeader>
          <DialogTitle>{saving ? pendingTitle : title}</DialogTitle>
          <DialogDescription>{saving ? pendingDescription : description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onKeep}>Keep editing</Button>
          <Button variant="destructive" disabled={saving} onClick={onDiscard}>
            Discard changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Router and standalone fixtures share the same unsaved-work policy. */
export function UnsavedNavigationGuard({
  isDirty,
  onDiscard,
  allowSearchNavigation,
  ...copy
}: Copy & NavigationOptions) {
  const router = useRouter({ warn: false });
  const registry = useContext(GuardRegistry);
  const id = useId();
  const spec = useRef<GuardSpec>({ isDirty, onDiscard, allowSearchNavigation, ...copy });
  spec.current = { isDirty, onDiscard, allowSearchNavigation, ...copy };
  const previous = useRef("");
  useEffect(() => {
    if (!registry) return;
    registry.entries.set(id, spec);
    registry.changed();
    return () => {
      registry.entries.delete(id);
      registry.changed();
    };
  }, [registry, id]);
  useEffect(() => {
    const state = JSON.stringify([isDirty(), copy.saving]);
    if (registry && state !== previous.current) {
      previous.current = state;
      registry.changed();
    }
  });
  if (registry) return null;
  return (
    <>
      <UnloadGuard isDirty={isDirty} />
      {router ? (
        <RouterGuard
          isDirty={isDirty}
          onDiscard={onDiscard}
          allowSearchNavigation={allowSearchNavigation}
          {...copy}
        />
      ) : null}
    </>
  );
}

function RouterGuard({
  isDirty,
  onDiscard,
  allowSearchNavigation,
  ...copy
}: Copy & NavigationOptions) {
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      !(allowSearchNavigation && current.pathname === next.pathname) && isDirty(),
    // The shared native guard also covers standalone and memory-history surfaces.
    enableBeforeUnload: false,
    withResolver: true,
  });
  useEffect(() => {
    // A confirmed save can supersede an earlier attempt to leave while saving.
    if (blocker.status === "blocked" && !isDirty()) blocker.reset?.();
  }, [blocker.status, blocker.reset, isDirty]);
  return (
    <DiscardChangesDialog
      open={blocker.status === "blocked"}
      onKeep={() => blocker.reset?.()}
      onDiscard={() => {
        onDiscard?.();
        blocker.proceed?.();
      }}
      {...copy}
    />
  );
}

function UnloadGuard({ isDirty }: { isDirty: () => boolean }) {
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [isDirty]);
  return null;
}
