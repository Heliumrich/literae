export type AssetTier = "medium" | "large" | "xlarge" | "original";

/** Choisit le preset Directus selon l’écran. Qualité max → original. */
export function assetTier(allowOriginal = true): AssetTier {
  if (allowOriginal && document.documentElement.getAttribute("data-quality") === "max") {
    return "original";
  }
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(screen.width, screen.height) * dpr;
  const css = Math.max(window.innerWidth, window.innerHeight);
  if (px >= 3000) return "xlarge";
  if (css >= 900 || px >= 1600) return "large";
  return "medium";
}

export function pickAssetSrc(el: {
  dataset: DOMStringMap;
}, allowOriginal = true): string {
  const tier = assetTier(allowOriginal);
  return (
    el.dataset[tier] ||
    el.dataset.large ||
    el.dataset.medium ||
    el.dataset.xlarge ||
    el.dataset.original ||
    ""
  );
}
