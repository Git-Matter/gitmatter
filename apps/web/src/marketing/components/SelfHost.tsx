import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import Eyebrow from "@/marketing/components/Eyebrow";

// "Runs on your terms" band: warm editorial, full-bleed sunken paper with
// hairline rules — not a generic dark SaaS block. Plain language, no jargon.
const POINTS = [
  {
    title: "Install it yourself",
    body: "Set it up on your own computer or server in minutes. Nothing locked to one company's cloud.",
  },
  {
    title: "Your documents stay private",
    body: "Your files are never kept or used to train anyone's model. Every step is on the record.",
  },
];

export default function SelfHost() {
  return (
    <section className="border-y border-border bg-secondary/60">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <Eyebrow>runs on your terms</Eyebrow>
        <h2 className="mt-stack max-w-[16ch] font-heading text-4xl tracking-tight text-balance">
          Set it up your way.
        </h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 md:gap-16">
          {POINTS.map((p) => (
            <div key={p.title} className="flex flex-col gap-1 border-t border-border pt-4">
              <h3 className="font-heading text-lg tracking-tight">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-section flex flex-wrap gap-3">
          <Link to="/login">
            <Button size="lg">See a demo</Button>
          </Link>
          <a href={SITE.docs}>
            <Button size="lg" variant="outline">
              Read the docs
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}
