/**
 * Products hidden from marketplace-style lists (Discover, /products, Purchases, dashboard product table).
 * Match is exact on trimmed title, case-insensitive.
 */
const HIDDEN_TITLES = new Set(
  [
    "pinte",
    "test0",
    "hero1",
    "faizer",
    "oops project",
    "test5",
    "test3",
    "test1",
    "1000xdev",
  ].map((t) => t.trim().toLowerCase()),
);

export function isHiddenFromProductListings(product: { title?: string } | null | undefined): boolean {
  const title = String(product?.title ?? "").trim().toLowerCase();
  if (!title) return false;
  return HIDDEN_TITLES.has(title);
}

/** Same visibility as Discover: published listings only, not blocklisted, product must exist. */
export function isShownOnDiscover(
  product: { title?: string; status?: "draft" | "published"; _id?: string } | null | undefined,
): boolean {
  if (!product || !product._id) return false;
  if (product.status === "draft") return false;
  if (isHiddenFromProductListings(product)) return false;
  return true;
}
