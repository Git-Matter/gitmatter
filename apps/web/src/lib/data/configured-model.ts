import type { ProviderCatalog } from "@workspace/contracts";

/** A remembered choice is usable only with current provider configuration. */
export function configuredModelAvailable(
  model: string,
  providers: ProviderCatalog[],
  allowOpenRouter = true
): boolean {
  if (!model || model.length > 200) return false;
  return (
    providers.some(
      (provider) =>
        provider.available && provider.models.some((candidate) => candidate.id === model)
    ) ||
    (allowOpenRouter &&
      /^[^\s/]+\/[^\s]+$/.test(model) &&
      providers.some((provider) => provider.provider === "openrouter" && provider.available))
  );
}
