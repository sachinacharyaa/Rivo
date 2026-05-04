import type { ProductShape } from "../types/product";

export type ProductCurrency = NonNullable<ProductShape["currency"]>;

export const CRYPTO_OPTIONS = [
  { code: "PUSD" as const, label: "PUSD", symbol: "₱" },
  { code: "SOL" as const, label: "SOL (Solana)", symbol: "◎" },
  { code: "USDC" as const, label: "USDC", symbol: "$" },
  { code: "AUDD" as const, label: "AUDD (Australian Digital Dollar)", symbol: "A$" },
];

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const SUPPORTED_CURRENCIES: ProductCurrency[] = ["PUSD", "SOL", "USDC", "AUDD"];

const numberFormatters = new Map<string, Intl.NumberFormat>();

function formatter(minimumFractionDigits: number, maximumFractionDigits: number) {
  const key = `${minimumFractionDigits}:${maximumFractionDigits}`;
  const cached = numberFormatters.get(key);
  if (cached) return cached;
  const next = new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  });
  numberFormatters.set(key, next);
  return next;
}

export function normalizeCurrency(currency?: ProductShape["currency"]): ProductCurrency {
  return currency ?? "PUSD";
}

export function getProductPriceAmount(
  p: Pick<ProductShape, "currency" | "price" | "priceSol" | "priceUsdc" | "priceAudd">,
) {
  const c = normalizeCurrency(p.currency);
  if (c === "PUSD") return (p.price ?? 0) / 1_000_000;
  if (c === "USDC") return p.priceUsdc ?? 0;
  if (c === "AUDD") return p.priceAudd ?? 0;
  return p.priceSol ?? 0;
}

export function formatTokenAmount(amount: number | null | undefined, currency: ProductCurrency, decimals = 2) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return `-- ${currency}`;
  const safeAmount = Object.is(amount, -0) ? 0 : amount;
  return `${formatter(decimals, decimals).format(safeAmount)} ${currency}`;
}

export function formatProductPrice(p: Pick<ProductShape, "currency" | "priceSol" | "priceUsdc" | "priceAudd">) {
  const c = normalizeCurrency(p.currency);
  return formatTokenAmount(getProductPriceAmount(p), c);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`Image must be under ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file."));
    r.readAsDataURL(file);
  });
}

export function productPublicPath(product: { _id: string; slug?: string }) {
  if (product.slug && product.slug.trim().length > 0) return `/${product.slug}`;
  return `/p/${product._id}`;
}

export function productPublicUrl(product: { _id: string; slug?: string } | string) {
  if (typeof product === "string") return `${window.location.origin}/p/${product}`;
  return `${window.location.origin}${productPublicPath(product)}`;
}
