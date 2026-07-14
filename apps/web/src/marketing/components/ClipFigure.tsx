// Looping product clip in a bordered card, shared by the /platform pages.
export default function ClipFigure({ src, label }: { src: string; label: string }) {
  return (
    <figure className="m-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      <video
        className="aspect-[4/3] w-full"
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={label}
      />
    </figure>
  );
}
