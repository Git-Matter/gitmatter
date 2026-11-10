import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import Eyebrow from "@/marketing/components/Eyebrow";

const POINTS = [
  { k: "Understand the file", v: "start with the source documents" },
  { k: "Prepare the next step", v: "briefings, reviews, client updates" },
  { k: "Use your own AI", v: "your approved assistant or API account" },
  { k: "Keep a clear record", v: "who changed what, and when" },
];

export default function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-28 pb-28 text-center sm:pt-36">
      <div className="flex flex-col items-center gap-7">
        <Eyebrow>for Australian sole practitioners &amp; general practices</Eyebrow>
        <h1 className="max-w-[18ch] font-heading text-5xl leading-[1.06] tracking-tight text-balance sm:text-7xl">
          Make sense of the file. Prepare the next step.
        </h1>
        <p className="max-w-[54ch] text-lg leading-relaxed text-muted-foreground">
          Turn matter documents into a briefing, an agreement review, or a draft client update.
          Check the sources, make your decisions, and keep the work on the matter file.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" nativeButton={false} render={<a href="/australian-practices" />}>
            Explore the Australian pilot
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
      </div>

      {/* Product video — the proof. Poster + controls for the visitor to play. */}
      <div className="mt-section overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <video
          className="aspect-video w-full"
          poster="/demo-poster.png"
          controls
          playsInline
          preload="auto"
        >
          <source src="/demo.mp4" type="video/mp4" />
        </video>
      </div>

      {/* The pitch in one glance — four plain benefits, hairline-divided. */}
      <dl className="mt-section grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-left sm:grid-cols-4">
        {POINTS.map((p) => (
          <div key={p.k} className="flex flex-col gap-1 bg-card px-5 py-5">
            <dt className="font-heading text-lg tracking-tight">{p.k}</dt>
            <dd className="text-xs text-muted-foreground">{p.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
