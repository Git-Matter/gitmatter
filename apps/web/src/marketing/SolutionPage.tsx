import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getSolution, SOLUTIONS } from "@/marketing/catalog";
import Eyebrow from "@/marketing/components/Eyebrow";
import CTASection from "@/marketing/components/CTASection";

// Cloud-only /solutions/$slug child page: one use case, who it serves, and
// the other solutions. Unknown slugs 404 in the route loader.
export default function SolutionPage() {
  const { slug } = useParams({ from: "/(marketing)/solutions/$slug" });
  const item = getSolution(slug);
  if (!item) return null;

  const others = SOLUTIONS.filter((s) => s.slug !== slug);

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-3xl px-6 pt-section">
        <Link
          to="/solutions"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Solutions
        </Link>
        <div className="flex flex-col gap-stack py-12">
          <Eyebrow>{item.tag}</Eyebrow>
          <h1 className="max-w-[24ch] font-heading text-4xl tracking-tight text-balance sm:text-5xl">
            {item.title}
          </h1>
          <p className="max-w-[56ch] text-lg leading-relaxed text-muted-foreground">{item.body}</p>
          <p className="text-sm text-muted-foreground/80">{item.who}</p>
        </div>
      </div>

      <section className="mx-auto w-full max-w-3xl px-6 pt-4">
        <div className="border-t border-border pt-8">
          <Eyebrow>more solutions</Eyebrow>
          <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {others.map((s) => (
              <Link
                key={s.slug}
                to="/solutions/$slug"
                params={{ slug: s.slug }}
                className="group flex flex-col gap-0.5 py-2"
              >
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {s.tag}
                  <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">{s.menuDesc}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTASection />
    </div>
  );
}
