import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { type SourceCard } from "@/lib/data/api";
import { type Step } from "./useChatSession";

// Page-level state for the activity side panel. Lives above the conversation so
// the panel can PUSH the chat column (a layout sibling) rather than overlay it.
type PanelState = { steps: Step[]; onOpenSource?: (card: SourceCard) => void } | null;

type ActivityPanelCtx = {
  state: PanelState;
  open: (steps: Step[], onOpenSource?: (card: SourceCard) => void) => void;
  close: () => void;
};

const ActivityPanelContext = createContext<ActivityPanelCtx | null>(null);

export function ActivityPanelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PanelState>(null);
  const value = useMemo<ActivityPanelCtx>(
    () => ({
      state,
      open: (steps, onOpenSource) => setState({ steps, onOpenSource }),
      close: () => setState(null),
    }),
    [state]
  );
  return <ActivityPanelContext.Provider value={value}>{children}</ActivityPanelContext.Provider>;
}

export function useActivityPanel() {
  return useContext(ActivityPanelContext);
}
