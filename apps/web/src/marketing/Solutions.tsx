import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import { SOLUTIONS } from "@/marketing/catalog";
import CTASection from "@/marketing/components/CTASection";

// Cloud-only /solutions index mapping the work people search for — contract
// redline, extraction, drafting, audit trail, connect-your-agent,
// your-own-key — onto what gitmatter does. Each solution also has its own
// child page at /solutions/$slug.
export default function Solutions() {
  return (
    <div className="flex flex-col">
      <header className="mx-auto flex max-w-3xl flex-col gap-stack px-6 pt-section pb-24 text-center">
        <h1 className="font-heading text-4xl tracking-tight text-balance sm:text-5xl">
          The legal work you already do — on the record.
        </h1>
        <p className="mx-auto max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
          Redline, extract, and draft with AI. Connect the assistant your firm already pays for, run
          it on your own key, and keep a full record of every change — who, what, and when.
        </p>
      </header>

      <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-24 sm:grid-cols-2 md:gap-16">
        {SOLUTIONS.map((u) => (
          <section
            key={u.slug}
            id={u.slug}
            className="flex scroll-mt-20 flex-col gap-3 border-t border-border pt-6"
          >
            <span className="text-sm font-medium text-muted-foreground">{u.tag}</span>
            <h2 className="font-heading text-2xl tracking-tight">{u.title}</h2>
            <p className="leading-relaxed text-muted-foreground">{u.body}</p>
            <p className="mt-1 text-sm text-muted-foreground">{u.who}</p>
            <Link
              to="/solutions/$slug"
              params={{ slug: u.slug }}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-bronze"
            >
              Learn more
              <ArrowRight className="size-4" />
            </Link>
          </section>
        ))}
      </div>

      <section className="mx-auto max-w-7xl px-6 pb-8">
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-8">
          <Button variant="outline" nativeButton={false} render={<Link to="/compare/harvey" />}>
            Compare with Harvey
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href={SITE.docs} />}>
            Read docs
          </Button>
        </div>
      </section>

      <CTASection />
    </div>
  );
}
