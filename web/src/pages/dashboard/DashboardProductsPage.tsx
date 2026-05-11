import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { api } from "../../lib/api";
import {
  formatTokenAmount,
  getProductPriceAmount,
  normalizeCurrency,
  productPublicPath,
  productPublicUrl,
  SUPPORTED_CURRENCIES,
  type ProductCurrency,
} from "../../lib/productUtils";
import { ProductPriceWithLogo } from "../../components/CurrencyPriceAssets";
import type { ProductShape } from "../../types/product";
import { isHiddenFromProductListings } from "../../lib/hiddenProducts";

type CurrencyTotals = Record<ProductCurrency, number>;

function emptyCurrencyTotals(): CurrencyTotals {
  return { PUSD: 0, SOL: 0, USDC: 0, USDT: 0, AUDD: 0 };
}

function CurrencyTotalsList({ totals }: { totals: CurrencyTotals }) {
  const active = SUPPORTED_CURRENCIES.filter((currency) => totals[currency] > 0);
  const currencies = active.length > 0 ? active : (["SOL"] as ProductCurrency[]);
  return (
    <div className="gum-token-stack">
      {currencies.map((currency) => (
        <span key={currency} className="gum-token-stack__line">
          {formatTokenAmount(totals[currency], currency)}
        </span>
      ))}
    </div>
  );
}

export function DashboardProductsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? "";
  const [products, setProducts] = useState<ProductShape[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!wallet) return;
    setLoading(true);
    api
      .get<ProductShape[]>(`/products/creator/${wallet}`)
      .then((r) =>
        setProducts(r.data.filter((product) => !isHiddenFromProductListings(product))),
      )
      .finally(() => setLoading(false));
  }, [wallet]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) => `${p.title} ${p.description}`.toLowerCase().includes(s));
  }, [products, q]);

  const totals = useMemo(() => {
    const sales = filtered.reduce((a, p) => a + p.salesCount, 0);
    const revenue = filtered.reduce<CurrencyTotals>((acc, p) => {
      const currency = normalizeCurrency(p.currency);
      acc[currency] += getProductPriceAmount(p) * p.salesCount;
      return acc;
    }, emptyCurrencyTotals());
    return { sales, revenue };
  }, [filtered]);

  return (
    <div className="gum-page">
      <div className="gum-products-header">
        <h1 className="gum-page__h1">Products</h1>
        <div className="gum-products-header__actions">
          <div className="gum-search-wrap">
            <span className="gum-search-ico" aria-hidden>
              ⌕
            </span>
            <input
              type="search"
              className="gum-search-input"
              placeholder="Search products…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search products"
            />
          </div>
          <Link to="/dashboard/products/new" className="gum-btn gum-btn--pink">
            New product
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="gum-muted">Loading…</p>
      ) : (
        <div className="gum-table-wrap">
          <table className="gum-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Sales</th>
                <th>Revenue</th>
                <th>Price</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="gum-table__empty">
                    No products yet.{" "}
                    <Link to="/dashboard/products/new" className="gum-link">
                      Create one
                    </Link>
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const currency = normalizeCurrency(p.currency);
                  const rev = getProductPriceAmount(p) * p.salesCount;
                  const status = p.status === "draft" ? "Draft" : "Published";
                  return (
                    <tr key={p._id}>
                      <td>
                        <div className="gum-table-name">
                          {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" className="gum-table-thumb" /> : <div className="gum-table-thumb gum-table-thumb--ph" />}
                          <div>
                            <div className="gum-table-name__title-row">
                              <div className="gum-table-name__title">{p.title}</div>
                              <Link to={`/dashboard/products/${p._id}/edit`} className="gum-link gum-link--edit">
                                Edit
                              </Link>
                            </div>
                            <a href={productPublicUrl(p)} className="gum-table-name__url" target="_blank" rel="noreferrer">
                              {productPublicUrl(p).replace(/^https?:\/\//, "")}
                            </a>
                          </div>
                        </div>
                      </td>
                      <td>{p.salesCount}</td>
                      <td>{formatTokenAmount(rev, currency)}</td>
                      <td>
                        <ProductPriceWithLogo product={p} />
                      </td>
                      <td>
                        <span className={`gum-status gum-status--${status === "Published" ? "live" : "draft"}`}>{status}</span>
                      </td>
                      <td>
                        <Link to={productPublicPath(p)} className="gum-link">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 ? (
              <tfoot>
                <tr className="gum-table__foot">
                  <td>Total</td>
                  <td>{totals.sales}</td>
                  <td>
                    <CurrencyTotalsList totals={totals.revenue} />
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </div>
  );
}
