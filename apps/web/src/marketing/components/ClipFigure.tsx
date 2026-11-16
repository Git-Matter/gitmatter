import ProductVideo from "./ProductVideo";

// Rendered illustrations are user-controlled; browsing never starts playback.
export default function ClipFigure({ src, label }: { src: string; label: string }) {
  return <ProductVideo src={src} label={label} className="aspect-[4/3]" />;
}
