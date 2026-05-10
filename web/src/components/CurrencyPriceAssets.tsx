import type { ProductCurrency } from "../lib/productUtils";
import { normalizeCurrency } from "../lib/productUtils";
import type { ProductShape } from "../types/product";
import { formatProductPrice } from "../lib/productUtils";

/** Static URLs under `public/assets/` */
export const CURRENCY_LOGO_SRC: Partial<Record<ProductCurrency, string>> = {
  PUSD: "/assets/pusd-logo.png",
  USDT: "/assets/usdt-logo.png",
  SOL: "/assets/sol-logo.png",
  AUDD: "/assets/audd-logo.png",
};

export function CurrencyLogo({
  currency,
  className = "rivo-currency-logo",
  title,
}: {
  currency: ProductCurrency | undefined;
  className?: string;
  /** e.g. accessible name when not decorative */
  title?: string;
}) {
  const c = normalizeCurrency(currency);
  const src = CURRENCY_LOGO_SRC[c];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={title ?? ""}
      className={className}
      {...(title ? {} : { "aria-hidden": true })}
    />
  );
}

export function PriceFieldLabel({
  currency,
  children = "Price",
}: {
  currency: ProductCurrency | undefined;
  children?: string;
}) {
  return (
    <span className="rivo-price-label">
      <CurrencyLogo currency={currency} />
      <span className="rivo-price-label__text">{children}</span>
    </span>
  );
}

export function ProductPriceWithLogo({
  product,
  className = "rivo-price-value",
}: {
  product: Pick<ProductShape, "currency" | "price" | "priceSol" | "priceUsdc" | "priceUsdt" | "priceAudd">;
  className?: string;
}) {
  const c = normalizeCurrency(product.currency);
  const src = CURRENCY_LOGO_SRC[c];
  return (
    <span className={className}>
      {src ? <CurrencyLogo currency={c} className={`${className}__logo`} /> : null}
      <span className={`${className}__amount`}>{formatProductPrice(product)}</span>
    </span>
  );
}
