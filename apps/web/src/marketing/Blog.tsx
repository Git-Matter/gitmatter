import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import Eyebrow from "@/marketing/components/Eyebrow";
import CTASection from "@/marketing/components/CTASection";
import { posts } from "@/marketing/blog/posts";
import { formatPostDate } from "@/marketing/blog/format";

// Cloud-only blog index — the Harvey/Legora "insights" page in gitmatter's
// register. Posts come from src/marketing/blog/posts (newest first).
export default function Blog() {
  return (
    <div className="flex flex-col">
      <header className="mx-auto flex max-w-3xl flex-col gap-stack px-6 pt-section pb-24 text-center">
        <Eyebrow>blog</Eyebrow>
        <h1 className="font-heading text-4xl tracking-tight text-balance sm:text-5xl">
          Legal AI, on the record.
        </h1>
        <p className="mx-auto max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
          Practical guides on AI-assisted legal work: redlining, review, audit trails, and
          connecting the assistant your firm already uses.
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col px-6">
        {posts.map((post) => (
          <article key={post.slug} className="border-t border-border py-12">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <time dateTime={post.meta.date}>{formatPostDate(post.meta.date)}</time>
              {post.meta.tags.map((tag) => (
                <span key={tag} className="tracking-[0.15em] text-bronze uppercase">
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="mt-3 font-heading text-2xl tracking-tight text-balance">
              <Link
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="hover:text-muted-foreground"
              >
                {post.meta.title}
              </Link>
            </h2>
            <p className="mt-3 max-w-[60ch] leading-relaxed text-muted-foreground">
              {post.meta.description}
            </p>
            <Link
              to="/blog/$slug"
              params={{ slug: post.slug }}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium hover:text-muted-foreground"
            >
              Read the post
              <ArrowRight className="size-4" />
            </Link>
          </article>
        ))}
      </div>

      <CTASection />
    </div>
  );
}
