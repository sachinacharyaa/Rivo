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
