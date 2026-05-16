import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { api } from "../../lib/api";
import { formatTokenAmount, SUPPORTED_CURRENCIES, type ProductCurrency } from "../../lib/productUtils";
import type { ProductShape } from "../../types/product";
import { TOKENS } from "../../config/tokens";
import { isHiddenFromProductListings } from "../../lib/hiddenProducts";

type PurchaseRow = {
  _id: string;
  currency?: ProductCurrency;
  amount?: number;
  amountSol?: number;
  productId?:
    | Pick<ProductShape, "currency" | "price" | "priceSol" | "priceUsdc">
    | string
    | null;
  createdAt: string;
};

function purchaseCurrency(row: PurchaseRow): ProductCurrency {
  if (row.productId && typeof row.productId !== "string" && row.productId.currency) {
    return row.productId.currency;
  }
  return row.currency ?? "SOL";
}

function purchaseAmountForCurrency(row: PurchaseRow, currency: ProductCurrency) {
  const product = row.productId && typeof row.productId !== "string" ? row.productId : null;
  const rowCurrency = purchaseCurrency(row);

  if (product) {
    if (currency === "PUSD") return rowCurrency === "PUSD" ? (product.price ?? 0) / 1_000_000 : 0;
    if (currency === "USDC") return rowCurrency === "USDC" ? product.priceUsdc ?? 0 : 0;
    if (rowCurrency === "PUSD" || rowCurrency === "USDC") return 0;
    return product.priceSol ?? row.amountSol ?? 0;
  }

  if (row.amount !== undefined && rowCurrency === currency) {
    return currency === "PUSD" ? row.amount / 1_000_000 : row.amount;
  }
  if (currency === "SOL") return row.amountSol ?? 0;
  return 0;
}

function sumPurchases(rows: PurchaseRow[], currency: ProductCurrency, afterMs = 0) {
  return rows.reduce((total, row) => {
    if (afterMs > 0 && new Date(row.createdAt).getTime() < afterMs) return total;
    return total + purchaseAmountForCurrency(row, currency);
  }, 0);
}

export function DashboardHomePage() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const wallet = publicKey?.toBase58() ?? "";
  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [balancePusd, setBalancePusd] = useState<number | null>(null);
  const [products, setProducts] = useState<ProductShape[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [buyerPurchaseCount, setBuyerPurchaseCount] = useState(0);
  const [activityCurrency, setActivityCurrency] = useState<ProductCurrency>(() => {
    if (typeof localStorage === "undefined") return "PUSD";
    const saved = localStorage.getItem("Rivo_activity_currency");
    if (saved && SUPPORTED_CURRENCIES.includes(saved as ProductCurrency)) {
      return saved as ProductCurrency;
    }
    return "PUSD";
  });
  const [activityCurrencyOpen, setActivityCurrencyOpen] = useState(false);
  const activityMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem("Rivo_activity_currency", activityCurrency);
  }, [activityCurrency]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!activityMenuRef.current?.contains(e.target as Node)) setActivityCurrencyOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (!publicKey) return;
    connection.getBalance(publicKey).then((l) => setBalanceSol(l / LAMPORTS_PER_SOL));
  }, [connection, publicKey]);

  useEffect(() => {
    let cancelled = false;
    if (!publicKey) {
      setBalancePusd(null);
      return;
    }

    const loadPusdBalance = async () => {
      try {
        let mintAddress = TOKENS.PUSD.mint;
        try {
          const tokenRes = await api.get<{ PUSD?: { mint?: string } }>("/tokens");
          const apiMint = tokenRes.data?.PUSD?.mint?.trim();
          if (apiMint) mintAddress = apiMint;
        } catch {
          // Fallback to frontend-configured token if token metadata endpoint is unavailable.
        }

        const mint = new PublicKey(mintAddress);
        const ata = await getAssociatedTokenAddress(mint, publicKey);
        const ataInfo = await connection.getParsedAccountInfo(ata, "confirmed");
        if (cancelled) return;
        const amountRaw =
          ((ataInfo.value?.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } } | undefined)
            ?.parsed?.info?.tokenAmount?.amount as string | undefined) || "0";
        const amount = Number(amountRaw) / 10 ** TOKENS.PUSD.decimals;
        setBalancePusd(Number.isFinite(amount) ? amount : 0);
      } catch {
        if (!cancelled) setBalancePusd(0);
      }
    };

    void loadPusdBalance();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  useEffect(() => {
    if (!wallet) return;
    void Promise.all([
      api
        .get<ProductShape[]>(`/products/creator/${wallet}`)
        .then((r) =>
          setProducts(r.data.filter((product) => !isHiddenFromProductListings(product))),
        ),
      api.get<PurchaseRow[]>(`/purchases/creator/${wallet}`).then((r) => setPurchases(r.data)),
      api.get<unknown[]>(`/purchases/wallet/${wallet}`).then((r) => setBuyerPurchaseCount(r.data.length)),
    ]);
  }, [wallet]);

  const now = Date.now();
  const d7 = now - 7 * 86400000;
  const d30 = now - 30 * 86400000;

  const last7 = useMemo(() => sumPurchases(purchases, activityCurrency, d7), [purchases, activityCurrency, d7]);
  const last30 = useMemo(() => sumPurchases(purchases, activityCurrency, d30), [purchases, activityCurrency, d30]);
  const totalEarned = useMemo(() => sumPurchases(purchases, activityCurrency), [purchases, activityCurrency]);

  const totalSales = useMemo(() => products.reduce((s, p) => s + p.salesCount, 0), [products]);

  const shareDone = typeof localStorage !== "undefined" && localStorage.getItem("Rivo_gs_share") === "1";

  const gs = {
    welcome: !!wallet,
    product: products.length > 0,
    sale: totalSales > 0,
    listing: products.some((p) => p.status !== "draft"),
    share: shareDone,
    checkout: buyerPurchaseCount > 0,
  };

  const cards = [
    { title: "Welcome aboard", desc: "Connect your Solana wallet to Rivo.", done: gs.welcome, icon: "✌" },
    { title: "Showtime", desc: "Create your first product.", done: gs.product, icon: "🚀" },
    { title: "Go live", desc: "Publish a product to the marketplace.", done: gs.listing, icon: "🌊" },
    { title: "Spread to world", desc: "Share a product link with buyers.", done: gs.share, icon: "🌍" },
    { title: "Monetization", desc: "Make your first sale.", done: gs.sale, icon: "💰" },
    { title: "Checkout", desc: "Purchase the product & unlock it", done: gs.checkout, icon: "🔓" },
  ];

  return (
    <div className="gum-page">
      <h1 className="gum-page__h1">Dashboard</h1>

      <section className="gum-section">
        <h2 className="gum-section__title">Getting started</h2>
        <div className="gum-gs-grid">
          {cards.map((c) => (
            <div key={c.title} className={`gum-gs-card${c.done ? " gum-gs-card--done" : ""}`}>
              {c.done ? <span className="gum-gs-card__check" aria-label="Done" /> : null}
              <div className="gum-gs-card__icon" aria-hidden>
                {c.icon}
              </div>
              <div className="gum-gs-card__title">{c.title}</div>
              <p className="gum-gs-card__desc">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="gum-section">
        <div className="gum-section__title-row">
          <h2 className="gum-section__title">Activity</h2>
          <div className="gum-activity-currency" ref={activityMenuRef}>
            <button
              type="button"
              className="gum-activity-currency__trigger"
              aria-expanded={activityCurrencyOpen}
              onClick={(e) => {
                e.stopPropagation();
                setActivityCurrencyOpen((open) => !open);
              }}
            >
              <span>{activityCurrency}</span>
              <span className="gum-activity-currency__arrow">▾</span>
            </button>
            {activityCurrencyOpen ? (
              <ul className="gum-activity-currency__menu" role="listbox" aria-label="Activity currency">
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <li key={currency}>
                    <button
                      type="button"
                      className={`gum-activity-currency__item${currency === activityCurrency ? " gum-activity-currency__item--active" : ""}`}
                      onClick={() => {
                        setActivityCurrency(currency);
                        setActivityCurrencyOpen(false);
                      }}
                    >
                      {currency}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="gum-activity-row">
          <div className="gum-metric-card">
            <div className="gum-metric-card__label">Balance</div>
            <div className="gum-metric-card__value">
              {activityCurrency === "SOL"
                ? balanceSol !== null
                  ? formatTokenAmount(balanceSol, "SOL", 4)
                  : "--"
                : activityCurrency === "PUSD"
                  ? balancePusd !== null
                    ? formatTokenAmount(balancePusd, "PUSD", 2)
                    : "--"
                  : `-- ${activityCurrency}`}
            </div>
          </div>
          <div className="gum-metric-card">
            <div className="gum-metric-card__label">Last 7 days</div>
            <div className="gum-metric-card__value">{formatTokenAmount(last7, activityCurrency)}</div>
          </div>
          <div className="gum-metric-card">
            <div className="gum-metric-card__label">Last 30 days</div>
            <div className="gum-metric-card__value">{formatTokenAmount(last30, activityCurrency)}</div>
          </div>
          <div className="gum-metric-card">
            <div className="gum-metric-card__label">Total earnings</div>
            <div className="gum-metric-card__value">{formatTokenAmount(totalEarned, activityCurrency)}</div>
          </div>
        </div>
      </section>

      <p className="gum-footer-hint">
        Followers and sales will show up here as they come in. For now,{" "}
        <Link to="/dashboard/products/new">create a product</Link> or browse the{" "}
        <a href="/#marketplace">marketplace</a>.
      </p>
    </div>
  );
}
