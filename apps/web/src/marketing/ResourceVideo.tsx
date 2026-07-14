import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getVideo, VIDEOS } from "@/marketing/resourceCatalog";
import Eyebrow from "@/marketing/components/Eyebrow";
import CTASection from "@/marketing/components/CTASection";

// Cloud-only /resources/$slug watch page: the video with controls, what it
// shows, and the other videos. Unknown slugs 404 in the route loader.
export default function ResourceVideo() {
  const { slug } = useParams({ from: "/(marketing)/resources/$slug" });
  const video = getVideo(slug);
  if (!video) return null;

  const others = VIDEOS.filter((v) => v.slug !== slug);

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 pt-16">
        <Link
          to="/resources"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Resources
        </Link>
        <header className="flex flex-col gap-stack py-10">
          <Eyebrow>video</Eyebrow>
          <h1 className="max-w-[22ch] font-heading text-4xl tracking-tight text-balance sm:text-5xl">
            {video.title}
          </h1>
          <p className="max-w-[56ch] text-lg leading-relaxed text-muted-foreground">{video.desc}</p>
        </header>
        <figure className="m-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <video
            className="w-full"
            src={video.media}
            poster={video.poster}
            controls
            playsInline
            preload="metadata"
            aria-label={video.title}
          />
        </figure>

        <section className="pt-12">
          <Eyebrow>what it shows</Eyebrow>
          <ul className="mt-6 flex flex-col">
            {video.points.map((point) => (
              <li
                key={point}
                className="border-t border-border py-4 leading-relaxed text-muted-foreground first:border-t-0"
              >
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section className="pt-12">
          <Eyebrow>more videos</Eyebrow>
          <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {others.map((v) => (
              <Link
                key={v.slug}
                to="/resources/$slug"
                params={{ slug: v.slug }}
                className="group flex flex-col gap-0.5 py-2"
              >
                <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
                  {v.title}
                  <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">{v.desc}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <CTASection />
    </div>
  );
}
