import { type ReactNode, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
// NOTE: the data module is named resourceCatalog (not "resources") because
// "@/marketing/resources" resolves to this component file on case-insensitive
// filesystems, producing an undefined self-import.
import { RESOURCES, type Resource } from "@/marketing/resourceCatalog";
import CTASection from "@/marketing/components/CTASection";
import Eyebrow from "@/marketing/components/Eyebrow";

// Cloud-only /resources hub in the Harvey register: oversized serif hero, a
// featured item beside a compact list, then a card grid. Every card is real
// content — posts, product videos, docs guides, comparisons.

// Media thumb: paused video that plays while hovered (no always-on decoding),
// or a quiet typographic tile when there is no clip.
function Thumb({ item, className }: { item: Resource; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  if (!item.media) {
    return (
      <div
        className={`flex items-end rounded-lg border border-border bg-secondary/60 p-5 ${className ?? "aspect-[4/3]"}`}
      >
        <span className="max-w-[16ch] font-heading text-2xl tracking-tight text-balance">
          {item.title}
        </span>
      </div>
    );
  }
  return (
    <video
      ref={ref}
      className={`w-full rounded-lg border border-border bg-card object-cover ${className ?? "aspect-[4/3]"}`}
      src={item.media}
      poster={item.poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={item.title}
      onMouseEnter={() => void ref.current?.play().catch(() => {})}
      onMouseLeave={() => ref.current?.pause()}
    />
  );
}

// Route the card to its destination: internal Link or docs/external anchor.
function CardLink({
  item,
  className,
  children,
}: {
  item: Resource;
  className: string;
  children: ReactNode;
}) {
  if (item.href) {
    return (
      <a href={item.href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={item.to} className={className}>
      {children}
    </Link>
  );
}

function TypeLabel({ type }: { type: Resource["type"] }) {
  return <span className="text-xs font-medium tracking-[0.2em] text-bronze uppercase">{type}</span>;
}

export default function Resources() {
  const [featured, ...rest] = RESOURCES;
  const sideList = rest.slice(0, 4);
  const grid = rest.slice(4);

  return (
    <div className="flex flex-col">
      <header className="mx-auto w-full max-w-7xl px-6 pt-16 pb-16">
        <h1 className="font-heading text-6xl tracking-tight sm:text-7xl">Resources</h1>
        <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-muted-foreground">
          Guides, videos, and writing on AI-assisted legal work — and the record underneath it.
        </p>
      </header>

      {/* Featured item large left, compact list right (the Harvey layout). */}
      <section className="mx-auto grid w-full max-w-7xl gap-12 px-6 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <CardLink item={featured} className="group flex flex-col gap-4">
          <Thumb item={featured} className="aspect-[16/10]" />
          <div className="flex flex-col gap-2">
            <TypeLabel type={featured.type} />
            <span className="inline-flex items-start gap-2 font-heading text-2xl tracking-tight text-balance">
              {featured.title}
            </span>
            <span className="max-w-[60ch] leading-relaxed text-muted-foreground">
              {featured.desc}
            </span>
          </div>
        </CardLink>
        <div className="flex flex-col">
          {sideList.map((item) => (
            <CardLink
              key={item.title}
              item={item}
              className="group flex flex-col gap-1.5 border-t border-border py-5 first:border-t-0 first:pt-0"
            >
              <TypeLabel type={item.type} />
              <span className="inline-flex items-center gap-1.5 text-[15px] font-medium">
                {item.title}
                <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </span>
              <span className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                {item.desc}
              </span>
            </CardLink>
          ))}
        </div>
      </section>

      {/* The grid. */}
      <section className="mx-auto w-full max-w-7xl px-6 pt-20">
        <Eyebrow>all resources</Eyebrow>
        <div className="mt-8 grid gap-x-8 gap-y-12 border-t border-border pt-12 sm:grid-cols-2 lg:grid-cols-3">
          {grid.map((item) => (
            <CardLink key={item.title} item={item} className="group flex flex-col gap-3">
              <Thumb item={item} />
              <div className="flex flex-col gap-1.5">
                <TypeLabel type={item.type} />
                <span className="inline-flex items-center gap-1.5 text-[15px] font-medium">
                  {item.title}
                  <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">{item.desc}</span>
              </div>
            </CardLink>
          ))}
        </div>
      </section>

      <CTASection />
    </div>
  );
}
