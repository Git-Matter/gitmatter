import { useRef } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import Eyebrow from "@/marketing/components/Eyebrow";

// Centered editorial hero built around transparency: the tagline, the demo
// video as proof, and two plain actions — run the demo, or set it up. Below it,
// four benefits in one glance. No jargon.
const POINTS = [
  { k: "Set up in minutes", v: "no IT project" },
  { k: "Use the AI you trust", v: "your agent, your key" },
  { k: "Every change recorded", v: "who, what, when" },
  { k: "Your work stays private", v: "never used to train AI" },
];

export default function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const runDemo = () => {
    const v = videoRef.current;
    if (!v) return;
    v.scrollIntoView({ behavior: "smooth", block: "center" });
    void v.play();
  };

  return (
    <section className="mx-auto max-w-5xl px-6 pt-28 pb-28 text-center sm:pt-36">
      <div className="flex flex-col items-center gap-7">
        <Eyebrow>see every step</Eyebrow>
        <h1 className="max-w-[16ch] font-heading text-6xl leading-[1.02] tracking-tight text-balance sm:text-7xl">
          Legal AI with full transparency.
        </h1>
        <p className="max-w-[54ch] text-lg leading-relaxed text-muted-foreground">
          Download, install, and run.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={runDemo}>
            <Play />
            Run the demo
          </Button>
          <a href={SITE.docs}>
            <Button size="lg" variant="outline">
              Set it up
            </Button>
          </a>
        </div>
      </div>

      {/* Demo video — the proof. Poster + controls; "Run the demo" plays it. */}
      <div className="mt-section overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <video
          ref={videoRef}
          className="aspect-video w-full"
          poster="/demo-poster.png"
          controls
          playsInline
          preload="metadata"
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
