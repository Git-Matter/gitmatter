import BrandMark from "@/components/BrandMark";

// Brand wordmark: the boxed commit-node mark (white glyph on the #15181e ink
// square, matching favicon.svg) leading the serif name. The node is the
// git/audit signature — a commit in the history.
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary">
        <BrandMark className="size-4 text-primary-foreground" />
      </span>
      <span className="font-heading text-xl font-normal tracking-tight">gitmatter</span>
    </span>
  );
}
