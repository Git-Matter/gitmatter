import registry from "../../../../design/media.json";

export const PRODUCT_MEDIA_DISCLOSURE = "Illustrative preview using example data.";

export function getProductMedia(src: string) {
  if (!Object.hasOwn(registry.assets, src))
    throw new Error(`Register and review the media origin before publishing: ${src}`);
  return registry.assets[src as keyof typeof registry.assets];
}
