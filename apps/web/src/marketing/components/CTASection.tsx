import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import Eyebrow from "@/marketing/components/Eyebrow";

// Closing call to action — editorial, left-aligned, calm.
export default function CTASection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-32">
      <Eyebrow>see it for yourself</Eyebrow>
      <h2 className="mt-stack max-w-[18ch] font-heading text-4xl tracking-tight text-balance sm:text-5xl">
        Bring a recurring task. Start with a sample.
      </h2>
      <p className="mt-stack max-w-[50ch] text-lg leading-relaxed text-muted-foreground">
        Explore the Australian practitioner pilot, or book a walkthrough. We will start with
        fictional documents and work through the setup, source checking, and Word handoff together.
      </p>
      <div className="mt-section flex flex-wrap items-center gap-3">
        <Button size="lg" nativeButton={false} render={<a href="/australian-practices#pilot" />}>
          Explore the pilot
        </Button>
        <Button
          size="lg"
          variant="outline"
          nativeButton={false}
          render={<a href={SITE.bookDemo} target="_blank" rel="noreferrer" />}
        >
          Book a walkthrough
        </Button>
      </div>
    </section>
  );
}
