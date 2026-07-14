import { Link, useParams } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import { FEATURES, getFeature } from "@/marketing/catalog";
import CTASection from "@/marketing/components/CTASection";

// Cloud-only /platform/$slug child page in the Harvey register: breadcrumb,
// oversized headline, full-width clip, capability sections, and a concrete
// "how teams use it" band. Copy comes from the catalog and states only what
// the product does — no invented metrics or testimonials. Unknown slugs 404
// in the route loader.
export default function PlatformFeature() {
  const { slug } = useParams({ from: "/(marketing)/platform/$slug" });
  const feature = getFeature(slug);
  if (!feature) return null;

  const others = FEATURES.filter((f) => f.slug !== slug);

  return (
    <div className="flex flex-col">
      {/* Hero: breadcrumb, oversized headline left, intro + demo right. */}
      <header className="mx-auto w-full max-w-7xl px-6 pt-16">
        <nav className="text-sm text-muted-foreground">
          <Link to="/platform" className="hover:text-foreground">
            Platform overview
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{feature.tag}</span>
        </nav>
        <div className="grid gap-10 py-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <h1 className="max-w-[16ch] font-heading text-5xl tracking-tight text-balance sm:text-6xl">
            {feature.title}
          </h1>
          <div className="flex flex-col items-start gap-6 lg:pt-3">
            <p className="max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
              {feature.intro}
            </p>
            <a href={SITE.bookDemo} target="_blank" rel="noreferrer">
              <Button size="lg">Book demo</Button>
            </a>
          </div>
        </div>
      </header>

      {/* The clip, full width like Harvey's hero screenshot. */}
      <div className="mx-auto w-full max-w-7xl px-6">
        <figure className="m-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <video
            className="w-full"
            src={feature.clip}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={`${feature.tag} demo`}
          />
        </figure>
      </div>

      {/* Capability sections: heading + lead left, points right. */}
      <div className="mx-auto flex w-full max-w-7xl flex-col px-6 pt-8">
        {feature.sections.map((section) => (
          <section
            key={section.title}
            className="grid gap-10 border-t border-border py-16 lg:grid-cols-2 lg:gap-16"
          >
            <div className="flex flex-col gap-4">
              <h2 className="max-w-[22ch] font-heading text-3xl tracking-tight text-balance">
                {section.title}
              </h2>
              <p className="max-w-[48ch] leading-relaxed text-muted-foreground">{section.lead}</p>
            </div>
            <div className="flex flex-col">
              {section.points.map((point) => (
                <div key={point.name} className="border-t border-border py-5 first:border-t-0">
                  <h3 className="text-[15px] font-medium">{point.name}</h3>
                  <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                    {point.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* How teams use it — concrete scenarios, the honest version of
          Harvey's "How teams use X" band. */}
      <section className="border-y border-border bg-secondary/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <h2 className="max-w-[16ch] font-heading text-3xl tracking-tight text-balance">
            How teams use {feature.tag.toLowerCase()}
          </h2>
          <ul className="flex flex-col">
            {feature.uses.map((use) => (
              <li
                key={use}
                className="border-t border-border py-4 leading-relaxed text-muted-foreground first:border-t-0"
              >
                {use}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The rest of the platform. */}
      <section className="mx-auto w-full max-w-7xl px-6 pt-16">
        <span className="text-xs font-medium tracking-[0.2em] text-bronze uppercase">
          more of the platform
        </span>
        <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((f) => (
            <Link
              key={f.slug}
              to="/platform/$slug"
              params={{ slug: f.slug }}
              className="group flex flex-col gap-0.5 py-2"
            >
              <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
                {f.tag}
                <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">{f.menuDesc}</span>
            </Link>
          ))}
        </div>
      </section>

      <CTASection />
    </div>
  );
}
