import { cn } from "@/lib/utils";

// Lightweight native checkbox styled to the theme — used for table row selection.
function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer rounded-[0.25rem] border border-input align-middle accent-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  );
}

export { Checkbox };
