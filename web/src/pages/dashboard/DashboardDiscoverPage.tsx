import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { isHiddenFromProductListings } from "../../lib/hiddenProducts";
import { productPublicPath } from "../../lib/productUtils";
import { ProductPriceWithLogo } from "../../components/CurrencyPriceAssets";
import { FormatProductDescription } from "../../lib/richDescription";
import type { ProductShape } from "../../types/product";

function shorten(address: string) {
  if (!address) return "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function DashboardDiscoverPage() {
  const [products, setProducts] = useState<ProductShape[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .get("/products")
      .then((res) => setProducts(res.data.filter((p) => !isHiddenFromProductListings(p))))
      .catch(() => setError("Unable to load products."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return products;
    return products.filter((p) =>
      `${p.title} ${p.description}`.toLowerCase().includes(lower),
    );
  }, [products, query]);

  return (
    <div className="gum-page">
      <div className="gum-products-header">
        <h1 className="gum-page__h1">Discover</h1>
        <div className="gum-products-header__actions">
          <div className="gum-search-wrap">
            <span className="gum-search-ico" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="search"
              className="gum-search-input"
              placeholder="Search products..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search products"
            />
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="gum-discover-grid">
          {[1, 2, 3, 4, 5, 6].map((k) => (
            <div
              className="gum-discover-card gum-discover-card--skeleton"
              key={k}
              aria-hidden
            >
              <div className="gum-discover-thumb gum-discover-thumb--ph" />
              <div className="gum-discover-body">
                <div className="skeleton-line skeleton-line--title" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-line--short" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="gum-empty">No published products yet.</div>
      ) : (
        <div className="gum-discover-grid">
          {filtered.map((product) => (
            <Link
              to={productPublicPath(product)}
              key={product._id}
              className="gum-discover-card"
            >
              {product.thumbnailUrl ? (
                <img
                  src={product.thumbnailUrl}
                  alt=""
                  className="gum-discover-thumb"
                />
              ) : (
                <div className="gum-discover-thumb gum-discover-thumb--ph" />
              )}
              <div className="gum-discover-body">
                <div className="gum-discover-title">{product.title}</div>
                <p className="gum-discover-meta">
                  {product.summary ? (
                    product.summary
                  ) : (
                    <FormatProductDescription text={product.description} />
                  )}
                </p>
                <div className="gum-discover-row">
                  <span className="gum-discover-creator">
                    {shorten(product.creatorWallet)}
                  </span>
                  <span className="gum-discover-price">
                    <ProductPriceWithLogo product={product} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
