// Brand wordmark: a bronze commit node leading the serif name. The dot is the
// git/audit signature — a commit in the history.
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      <span className="size-2 translate-y-[-1px] rounded-full bg-bronze" />
      <span className="font-heading text-xl font-semibold tracking-tight">gitmatter</span>
    </span>
  );
}
