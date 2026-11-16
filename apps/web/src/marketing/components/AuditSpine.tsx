import ClipFigure from "@/marketing/components/ClipFigure";

export default function AuditSpine() {
  return (
    <section className="bg-secondary">
      <div className="page-container grid items-center gap-10 py-band lg:grid-cols-2 lg:gap-20">
        <div>
          <h2 className="max-w-[18ch] text-section">See how the clause got here.</h2>
          <p className="mt-6 max-w-[48ch] leading-relaxed text-ink-secondary">
            Open the change history to see who edited the language, why they changed it, and the
            exact before and after. People and agents share the same record.
          </p>
        </div>
        <ClipFigure
          src="/features/audit.mp4"
          label="Inspect a clause’s change history in gitmatter"
        />
      </div>
    </section>
  );
}
