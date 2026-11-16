import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import ProductVideo from "./ProductVideo";

export default function Hero() {
  return (
    <section className="page-container pt-16 pb-band sm:pt-24">
      <div className="grid items-end gap-8 pb-12 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
        <h1 className="max-w-[16ch] text-display">Review the contract. Keep the whole story.</h1>
        <div className="flex flex-col items-start gap-6 lg:pb-1">
          <p className="max-w-[42ch] text-lead text-ink-secondary">
            Review, redline, and draft with your own AI. Every edit keeps its author, reason, and
            exact before and after, so your team can check the work.
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <Button
              size="lg"
              nativeButton={false}
              render={<a href={SITE.bookDemo} target="_blank" rel="noreferrer" />}
            >
              Book a demo
            </Button>
            <a
              href={`${SITE.docs}/admin/self-hosting`}
              className="text-sm font-medium underline underline-offset-4"
            >
              Install locally
            </a>
          </div>
        </div>
      </div>
      <ProductVideo
        src="/demo.mp4"
        poster="/demo-poster.png"
        label="Watch the gitmatter product walkthrough"
        className="aspect-video"
        muted={false}
        caption="A contract review in gitmatter, from first pass to the change history."
      />
    </section>
  );
}
