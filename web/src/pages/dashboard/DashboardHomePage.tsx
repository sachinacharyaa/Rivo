import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { api } from "../../lib/api";
import type { ProductShape } from "../../types/product";

type PurchaseRow = {
  _id: string;
  amountSol: number;
  createdAt: string;
};

function sumPurchasesInRange(rows: PurchaseRow[], afterMs: number) {
  return rows.filter((r) => new Date(r.createdAt).getTime() >= afterMs).reduce((s, r) => s + r.amountSol, 0);
}

export function DashboardHomePage() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const wallet = publicKey?.toBase58() ?? "";
  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [products, setProducts] = useState<ProductShape[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);

  useEffect(() => {
    if (!publicKey) return;
    connection.getBalance(publicKey).then((l) => setBalanceSol(l / LAMPORTS_PER_SOL));
  }, [connection, publicKey]);

  useEffect(() => {
    if (!wallet) return;
    api.get<ProductShape[]>(`/products/creator/${wallet}`).then((r) => setProducts(r.data));
    api.get<PurchaseRow[]>(`/purchases/creator/${wallet}`).then((r) => setPurchases(r.data));
  }, [wallet]);

  const now = Date.now();
  const d7 = now - 7 * 86400000;
  const d30 = now - 30 * 86400000;

  const last7 = useMemo(() => sumPurchasesInRange(purchases, d7), [purchases, d7]);
  const last30 = useMemo(() => sumPurchasesInRange(purchases, d30), [purchases, d30]);
  const totalEarned = useMemo(() => purchases.reduce((s, p) => s + p.amountSol, 0), [purchases]);

  const totalSales = useMemo(() => products.reduce((s, p) => s + p.salesCount, 0), [products]);

  const profileDone = typeof localStorage !== "undefined" && localStorage.getItem("Rivo_gs_profile") === "1";
  const payoutDone = typeof localStorage !== "undefined" && localStorage.getItem("Rivo_gs_payout") === "1";
  const shareDone = typeof localStorage !== "undefined" && localStorage.getItem("Rivo_gs_share") === "1";

  const gs = {
    welcome: !!wallet,
    profile: profileDone,
    product: products.length > 0,
    follower: false,
    sale: totalSales > 0,
    payout: payoutDone || totalSales > 0,
    listing: products.some((p) => p.status !== "draft"),
    share: shareDone,
  };

  const cards = [
    { title: "Welcome aboard", desc: "Connect your Solana wallet to Rivo.", done: gs.welcome, icon: "✌" },
    { title: "Make an impression", desc: "Customize your creator profile (coming soon).", done: gs.profile, icon: "🖌" },
    { title: "Showtime", desc: "Create your first product.", done: gs.product, icon: "🚀" },
    { title: "Build your tribe", desc: "Get your first follower on-chain.", done: gs.follower, icon: "⚡" },
    { title: "Go live", desc: "Publish a product to the marketplace.", done: gs.listing, icon: "🌊" },
    { title: "Spread the word", desc: "Share a product link with buyers.", done: gs.share, icon: "🔗" },
    { title: "Cha-ching", desc: "Make your first sale.", done: gs.sale, icon: "🪙" },
    { title: "Money inbound", desc: "Track payouts from your sales.", done: gs.payout, icon: "💰" },
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
        <h2 className="gum-section__title">Activity</h2>
        <div className="gum-activity-row">
          <div className="gum-metric-card">
            <div className="gum-metric-card__label">Balance</div>
            <div className="gum-metric-card__value">{balanceSol !== null ? `${balanceSol.toFixed(4)} SOL` : "—"}</div>
          </div>
          <div className="gum-metric-card">
            <div className="gum-metric-card__label">Last 7 days</div>
            <div className="gum-metric-card__value">{last7.toFixed(2)} SOL</div>
          </div>
          <div className="gum-metric-card">
            <div className="gum-metric-card__label">Last 30 days</div>
            <div className="gum-metric-card__value">{last30.toFixed(2)} SOL</div>
          </div>
          <div className="gum-metric-card">
            <div className="gum-metric-card__label">Total earnings</div>
            <div className="gum-metric-card__value">{totalEarned.toFixed(2)} SOL</div>
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
