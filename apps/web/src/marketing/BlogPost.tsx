import { type ElementType, lazy, Suspense, useMemo } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Eyebrow from "@/marketing/components/Eyebrow";
import CTASection from "@/marketing/components/CTASection";
import { getPost, posts } from "@/marketing/blog/posts";
import { loadPostBody, type PostBody } from "@/marketing/blog/bodies";
import { formatPostDate } from "@/marketing/blog/format";

// Product clip with a caption, for use inside posts as
// <Clip src="/blog/audit-dive.mp4" caption="..." />. Post clips live in
// /public/blog; the shorter looping feature clips in /public/features also
// work here.
function Clip({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="mx-0 mt-8 overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      <video className="w-full" src={src} controls muted playsInline preload="metadata" />
      <figcaption className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

// Map MDX elements onto the marketing design system so posts read like the
// rest of the site without a typography plugin. Also exposes the custom
// components posts may use (Clip).
const mdxComponents: Record<string, ElementType> = {
  Clip,
  h2: ({ children }) => (
    <h2 className="mt-12 font-heading text-2xl tracking-tight text-balance">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 font-heading text-xl tracking-tight text-balance">{children}</h3>
  ),
  p: ({ children }) => <p className="mt-5 leading-relaxed text-muted-foreground">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-5 list-disc space-y-2 pl-6 leading-relaxed text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-5 list-decimal space-y-2 pl-6 leading-relaxed text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  a: (props) => <a {...props} className="text-foreground underline underline-offset-4" />,
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="mt-5 border-l-2 border-bronze pl-5 italic">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mt-5 overflow-x-auto rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
      {children}
    </pre>
  ),
  hr: () => <hr className="mt-12 border-border" />,
};

// One lazy component per slug, cached so re-renders don't re-create it.
const bodyCache = new Map<string, PostBody>();
function postBody(slug: string) {
  let C = bodyCache.get(slug);
  if (!C) {
    C = lazy(loadPostBody(slug));
    bodyCache.set(slug, C);
  }
  return C;
}

// Cloud-only blog post page. The slug is validated by the route loader
// (unknown slugs 404 before this renders).
export default function BlogPost() {
  const { slug } = useParams({ from: "/(marketing)/blog/$slug" });
  const post = getPost(slug);
  const Body = useMemo(() => postBody(slug), [slug]);
  if (!post) return null;

  const readNext = posts.filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <div className="flex flex-col">
      <article className="mx-auto w-full max-w-3xl px-6 pt-section">
        <header className="flex flex-col gap-stack">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            All posts
          </Link>
          <Eyebrow>{post.meta.tags[0] ?? "blog"}</Eyebrow>
          <h1 className="font-heading text-4xl tracking-tight text-balance sm:text-5xl">
            {post.meta.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {post.meta.author} ·{" "}
            <time dateTime={post.meta.date}>{formatPostDate(post.meta.date)}</time>
          </p>
        </header>

        <div className="pb-8">
          <Suspense fallback={null}>
            <Body components={mdxComponents} />
          </Suspense>
        </div>

        {readNext.length > 0 && (
          <footer className="border-t border-border py-12">
            <Eyebrow>read next</Eyebrow>
            <div className="mt-stack flex flex-col gap-6">
              {readNext.map((p) => (
                <Link
                  key={p.slug}
                  to="/blog/$slug"
                  params={{ slug: p.slug }}
                  className="group flex flex-col gap-1"
                >
                  <span className="inline-flex items-center gap-1.5 font-heading text-lg tracking-tight group-hover:text-muted-foreground">
                    {p.meta.title}
                    <ArrowRight className="size-4 shrink-0" />
                  </span>
                  <span className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
                    {p.meta.description}
                  </span>
                </Link>
              ))}
            </div>
          </footer>
        )}
      </article>

      <CTASection />
    </div>
  );
}
