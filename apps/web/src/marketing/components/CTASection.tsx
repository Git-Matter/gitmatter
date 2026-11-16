import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";

// Closing call to action — editorial, left-aligned, calm.
export default function CTASection() {
  return (
    <section className="page-container py-band">
      <h2 className="max-w-[20ch] text-section">Bring a contract. See the review.</h2>
      <p className="mt-stack max-w-[50ch] text-lg leading-relaxed text-muted-foreground">
        Book a walkthrough with your own AI account and see the record build itself: every change
        saved with who, what, and when.
      </p>
      <div className="mt-section flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          nativeButton={false}
          render={<a href={SITE.bookDemo} target="_blank" rel="noreferrer" />}
        >
          Book demo
        </Button>
        <Button size="lg" variant="outline" nativeButton={false} render={<a href={SITE.docs} />}>
          Read the setup guide
        </Button>
      </div>
    </section>
  );
}
