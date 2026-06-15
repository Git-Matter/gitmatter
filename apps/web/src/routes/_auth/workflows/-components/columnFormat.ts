import type { LucideIcon } from "lucide-react";
import {
  AlignLeft,
  Banknote,
  Calendar,
  DollarSign,
  Hash,
  List,
  Percent,
  Tag,
  ToggleLeft,
} from "lucide-react";

// Tabular column response formats. Free string on the wire (Column.format), but
// the editor offers this closed set.
export type ColumnFormat =
  | "text"
  | "bulleted_list"
  | "number"
  | "percentage"
  | "monetary_amount"
  | "currency"
  | "yes_no"
  | "date"
  | "tag";

export const FORMAT_OPTIONS: Array<{ value: ColumnFormat; label: string; icon: LucideIcon }> = [
  { value: "text", label: "Free Text", icon: AlignLeft },
  { value: "bulleted_list", label: "Bulleted list", icon: List },
  { value: "number", label: "Number", icon: Hash },
  { value: "percentage", label: "Percentage", icon: Percent },
  { value: "monetary_amount", label: "Monetary Amount", icon: Banknote },
  { value: "currency", label: "Currency", icon: DollarSign },
  { value: "yes_no", label: "Yes / No", icon: ToggleLeft },
  { value: "date", label: "Date", icon: Calendar },
  { value: "tag", label: "Tags", icon: Tag },
];

export function formatLabel(format: string): string {
  return FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? "Text";
}

export function formatIcon(format: string): LucideIcon {
  return FORMAT_OPTIONS.find((o) => o.value === format)?.icon ?? AlignLeft;
}
