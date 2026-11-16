import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/** A lifecycle label; the underlying state remains authoritative. */
export function StateCue({ children }: { tone: "bronze" | "muted"; children: ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>;
}
