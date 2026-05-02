import type { ProductShape } from "../types/product";

export const CRYPTO_OPTIONS = [
  { code: "SOL" as const, label: "SOL (Solana)", symbol: "◎" },
  { code: "USDC" as const, label: "USDC", symbol: "$" },
  { code: "AUDD" as const, label: "AUDD (Australian Digital Dollar)", symbol: "A$" },
];

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function formatProductPrice(p: Pick<ProductShape, "currency" | "priceSol" | "priceUsdc" | "priceAudd">) {
  const c = p.currency ?? "SOL";
  if (c === "USDC") return `${(p.priceUsdc ?? 0).toFixed(2)} USDC`;
  if (c === "AUDD") return `${(p.priceAudd ?? 0).toFixed(2)} AUDD`;
  return `${(p.priceSol ?? 0).toFixed(2)} SOL`;
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
