import { useRef, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import {
  PLATFORM_FEATURED,
  PLATFORM_ITEMS,
  RESOURCE_ITEMS,
  RESOURCES_FEATURED,
  SOLUTION_ITEMS,
  SOLUTIONS_FEATURED,
  type NavFeatured,
  type NavMenuItem,
} from "@/marketing/nav";
import Wordmark from "@/marketing/components/Wordmark";

// Menu link in the Harvey register: roomy type, and an arrow that slides in
// on hover to signal navigation.
const itemClass = "group/item flex flex-col gap-1 py-1";

function MenuItem({ item }: { item: NavMenuItem }) {
  const body = (
    <>
      <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
        {item.label}
        <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100" />
      </span>
      <span className="max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
        {item.desc}
      </span>
    </>
  );
  if (item.href) {
    return (
      <a
        href={item.href}
        className={itemClass}
        {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {body}
      </a>
    );
  }
  return (
    <Link to={item.to} className={itemClass}>
      {body}
    </Link>
  );
}

// Featured card on the right of a panel (the Harvey pattern): looping clip,
// title, one-line description. The video loads nothing and stays paused until
// the menu is actually hovered (see NavDropdown) — three always-decoding
// videos in a header that mounts on every page is a real memory/CPU cost.
function FeaturedCard({
  featured,
  videoRef,
}: {
  featured: NavFeatured;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  return (
    <Link to={featured.to} className="group/item flex flex-col gap-2.5">
      <video
        ref={videoRef}
        className="aspect-[4/3] w-full rounded-lg border border-border bg-card"
        src={featured.media}
        poster={featured.poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={featured.title}
      />
      <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
        {featured.title}
        <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100" />
      </span>
      <span className="text-sm leading-relaxed text-muted-foreground">{featured.desc}</span>
    </Link>
  );
}

// Hover dropdown in the Harvey register: a trigger with a chevron, and a
// panel of title + one-line-description links in columns with a featured
// media card on the right. Pure CSS (group-hover + focus-within) so it needs
// no client state and works with keyboard focus.
function NavDropdown({
  label,
  to,
  items,
  featured,
  columns = 1,
}: {
  label: string;
  to: string;
  items: NavMenuItem[];
  featured: NavFeatured;
  columns?: 1 | 2;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    // Not `relative`: the panel positions against the nav (the nearest
    // positioned ancestor), which is centered in the page — centering a wide
    // panel on its own trigger clips it off the viewport edge.
    <div
      className="group"
      onMouseEnter={() => void videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => videoRef.current?.pause()}
    >
      <Link
        to={to}
        className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-muted-foreground group-hover:text-foreground"
      >
        {label}
        <ChevronDown className="size-3.5 transition-transform duration-200 group-hover:rotate-180" />
      </Link>
      {/* Full-bleed panel bar under the header (the Harvey pattern): spans
          the viewport, content aligned to the page grid. */}
      <div className="invisible absolute top-full left-1/2 z-50 w-screen -translate-x-1/2 pt-4 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <div className="border-y border-border bg-background shadow-lg">
          <div className="mx-auto grid max-w-7xl grid-cols-[1fr_320px] gap-x-16 px-6 py-12">
            <div
              className={
                columns === 2 ? "grid grid-cols-2 gap-x-16 gap-y-8" : "flex flex-col gap-8"
              }
            >
              {items.map((item) => (
                <MenuItem key={item.label} item={item} />
              ))}
            </div>
            <FeaturedCard featured={featured} videoRef={videoRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Shared chrome for the cloud-only marketing site: top nav + footer around the
// page outlet. Cloud-only — bundled solely when DEPLOYMENT=cloud. The site is
// pinned to light via forcedTheme in __root (pre-paint, no flash).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    // overflow-x-clip: the menu panels are w-screen (100vw), which includes
    // the vertical scrollbar's width — without clipping, that 15px excess
    // gives every page a slight horizontal scroll.
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <header className="relative z-40 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <Link to="/" aria-label="gitmatter home">
          <Wordmark />
        </Link>
        <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 text-sm">
          <NavDropdown
            label="Platform"
            to="/platform"
            items={PLATFORM_ITEMS}
            featured={PLATFORM_FEATURED}
            columns={2}
          />
          <NavDropdown
            label="Solutions"
            to="/solutions"
            items={SOLUTION_ITEMS}
            featured={SOLUTIONS_FEATURED}
            columns={2}
          />
          <NavDropdown
            label="Resources"
            to="/resources"
            items={RESOURCE_ITEMS}
            featured={RESOURCES_FEATURED}
          />
          <Link
            to="/about"
            className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            About
          </Link>
        </nav>
        <a href={SITE.bookDemo} target="_blank" rel="noreferrer">
          <Button size="sm">Book demo</Button>
        </a>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-section border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <Wordmark />
          </div>
          <nav className="flex flex-wrap items-center gap-4">
            <Link to="/platform" className="hover:text-foreground">
              Platform
            </Link>
            <Link to="/solutions" className="hover:text-foreground">
              Solutions
            </Link>
            <Link to="/compare" className="hover:text-foreground">
              Compare
            </Link>
            <Link to="/resources" className="hover:text-foreground">
              Resources
            </Link>
            <Link to="/blog" className="hover:text-foreground">
              Blog
            </Link>
            <a href={SITE.docs} className="hover:text-foreground">
              Docs
            </a>
            <a
              href={SITE.github}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <GitBranch className="size-4" />
              GitHub
            </a>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/security" className="hover:text-foreground">
              Security
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
