import { useId } from "react";
import { cn } from "@/lib/util/utils";
import { getProductMedia, PRODUCT_MEDIA_DISCLOSURE } from "@/marketing/productMedia";

/** One controlled playback and origin disclosure contract for public product previews. */
export default function ProductVideo({
  src,
  label,
  poster,
  caption,
  className,
  figureClassName,
  muted = true,
}: {
  src: string;
  label: string;
  poster?: string;
  caption?: string;
  className?: string;
  figureClassName?: string;
  muted?: boolean;
}) {
  const media = getProductMedia(src);
  const captionId = useId();
  return (
    <figure
      className={cn("m-0 overflow-hidden rounded-lg bg-card", figureClassName)}
      data-media-origin={media.kind}
    >
      <video
        className={cn("w-full", className)}
        src={src}
        poster={poster}
        controls
        muted={muted}
        playsInline
        preload="metadata"
        aria-label={label}
        aria-describedby={captionId}
      />
      <figcaption id={captionId} className="px-4 py-2.5 text-xs text-muted-foreground">
        <span className="block">{PRODUCT_MEDIA_DISCLOSURE}</span>
        {caption && <span className="mt-1 block">{caption}</span>}
      </figcaption>
    </figure>
  );
}
