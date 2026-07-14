import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import Eyebrow from "@/marketing/components/Eyebrow";

// Closing call to action — editorial, left-aligned, calm.
export default function CTASection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-32">
      <Eyebrow>see it for yourself</Eyebrow>
      <h2 className="mt-stack max-w-[18ch] font-heading text-4xl tracking-tight text-balance sm:text-5xl">
        See the work. Skip the black box.
      </h2>
      <p className="mt-stack max-w-[50ch] text-lg leading-relaxed text-muted-foreground">
        Book a walkthrough with your own AI account and see the record build itself: every change
        saved with who, what, and when. Set up in minutes.
      </p>
      <div className="mt-section flex flex-wrap items-center gap-3">
        <a href={SITE.bookDemo} target="_blank" rel="noreferrer">
          <Button size="lg">Book demo</Button>
        </a>
        <a href={SITE.docs}>
          <Button size="lg" variant="outline">
            Read docs
          </Button>
        </a>
      </div>
    </section>
  );
}
