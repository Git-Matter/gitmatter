import { Link } from "@tanstack/react-router";
import { SOLUTIONS } from "@/marketing/catalog";
import Eyebrow from "@/marketing/components/Eyebrow";

// The Harvey-style capability index: the work, set large in serif, each line
// a link to its solution page. Editorial by construction — type does the
// talking, no cards, no chrome.
export default function WorkIndex() {
  return (
    <section className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-24 lg:grid-cols-[1fr_2fr] lg:gap-16">
      <div className="flex flex-col gap-3">
        <Eyebrow>the work</Eyebrow>
        <p className="max-w-[28ch] leading-relaxed text-muted-foreground">
          The jobs firms bring to gitmatter — each one on the record, end to end.
        </p>
      </div>
      <ul className="flex flex-col">
        {SOLUTIONS.map((s) => (
          <li key={s.slug}>
            <Link
              to="/solutions/$slug"
              params={{ slug: s.slug }}
              className="group flex items-baseline justify-between gap-6 border-t border-border py-4"
            >
              <span className="font-heading text-3xl tracking-tight text-muted-foreground/60 transition-colors group-hover:text-foreground sm:text-4xl">
                {s.tag}
              </span>
              <span className="hidden max-w-[36ch] text-right text-sm leading-relaxed text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block">
                {s.menuDesc}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
