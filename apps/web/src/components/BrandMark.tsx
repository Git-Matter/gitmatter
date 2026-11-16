// The gitmatter mark, matching favicon.svg: a commit node over the audit-spine
// line. Renders in currentColor so callers control color via text-*; wrap in a
// box for the boxed (favicon-style) treatment. Single source of truth for the
// logo glyph across the wordmark and the app sidebar.
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <circle cx="16" cy="11" r="4.6" fill="currentColor" />
      <line
        x1="8"
        y1="22"
        x2="24"
        y2="22"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
