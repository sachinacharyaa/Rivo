import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { api } from "../../lib/api";
import { fetchSolUsdPrice, solToUsd } from "../../lib/solPrice";

type TopProduct = {
  product: {
    _id: string;
    title: string;
    price: number;
    priceSol: number;
    coverUrl?: string;
  };
  totalRevenueUsd: number;
  totalRevenueSol: number;
  buyersCount: number;
};

type LeaderboardData = {
  totalPlatformRevenueUsd: number;
  totalPlatformRevenueSol: number;
  totalProductSalesUsd: number;
  totalProductSalesSol: number;
  totalRivoSalesUsd: number;
  totalRivoSalesSol: number;
  totalPurchases: number;
  topProducts: TopProduct[];
};

type PlatformRevenueView = "usd" | "sol" | "total";

const PLATFORM_REVENUE_OPTIONS: { id: PlatformRevenueView; label: string }[] = [
  { id: "usd", label: "Platform Revenue (USD)" },
  { id: "sol", label: "Platform Revenue (SOL)" },
  { id: "total", label: "Total Platform Revenue" },
];

function formatUsd(n: number) {
  return `$${n.toFixed(2)}`;
}

export function DashboardAdminPage() {
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revenueView, setRevenueView] = useState<PlatformRevenueView>("usd");
  const [revenueMenuOpen, setRevenueMenuOpen] = useState(false);
  const [solUsd, setSolUsd] = useState<number | null>(null);
  const revenueMenuRef = useRef<HTMLDivElement>(null);

  const isAdmin = walletAddress === "6jaM7rGsMgk81pogFqMAGj7K8AByW8tQTTEnmDYFQpbH";

  useEffect(() => {
    if (!walletAddress) {
      setLoading(false);
      return;
    }
    if (!isAdmin) {
      setError("Forbidden: Not admin");
      setLoading(false);
      return;
    }

    api
      .get<LeaderboardData>("/admin/leaderboard", { params: { wallet: walletAddress } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }, [walletAddress, isAdmin]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const price = await fetchSolUsdPrice();
      if (!cancelled) setSolUsd(price);
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const close = (e: Event) => {
      if (!revenueMenuRef.current?.contains(e.target as Node)) setRevenueMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const platformRevenueSolUsd = useMemo(() => {
    if (!data) return null;
    return solToUsd(data.totalPlatformRevenueSol, solUsd);
  }, [data, solUsd]);

  const totalPlatformRevenueCombinedUsd = useMemo(() => {
    if (!data || platformRevenueSolUsd == null) return null;
    return data.totalPlatformRevenueUsd + platformRevenueSolUsd;
  }, [data, platformRevenueSolUsd]);

  const productSalesSolUsd = useMemo(() => {
    if (!data) return null;
    return solToUsd(data.totalProductSalesSol, solUsd);
  }, [data, solUsd]);

  const rivoSalesSolUsd = useMemo(() => {
    if (!data) return null;
    return solToUsd(data.totalRivoSalesSol, solUsd);
  }, [data, solUsd]);

  const totalProductSalesCombinedUsd = useMemo(() => {
    if (!data || productSalesSolUsd == null) return null;
    return data.totalProductSalesUsd + productSalesSolUsd;
  }, [data, productSalesSolUsd]);

  const totalRivoSalesCombinedUsd = useMemo(() => {
    if (!data || rivoSalesSolUsd == null) return null;
    return data.totalRivoSalesUsd + rivoSalesSolUsd;
  }, [data, rivoSalesSolUsd]);

  const totalTradeUsd = useMemo(() => {
    if (totalProductSalesCombinedUsd == null || totalRivoSalesCombinedUsd == null) return null;
    return totalProductSalesCombinedUsd + totalRivoSalesCombinedUsd;
  }, [totalProductSalesCombinedUsd, totalRivoSalesCombinedUsd]);

  const revenueHeadline = useMemo(() => {
    if (!data) return "--";
    if (revenueView === "usd") return formatUsd(data.totalPlatformRevenueUsd);
    if (revenueView === "sol") {
      if (platformRevenueSolUsd == null) return "--";
      return formatUsd(platformRevenueSolUsd);
    }
    if (totalPlatformRevenueCombinedUsd == null) return "--";
    return formatUsd(totalPlatformRevenueCombinedUsd);
  }, [data, revenueView, platformRevenueSolUsd, totalPlatformRevenueCombinedUsd]);

  const activeOption = PLATFORM_REVENUE_OPTIONS.find((o) => o.id === revenueView);

  const tradeHeadline = useMemo(() => {
    if (!data || totalTradeUsd == null) return "--";
    return formatUsd(totalTradeUsd);
  }, [data, totalTradeUsd]);

  if (!publicKey) {
    return <div className="page-section">Connect your admin wallet to view this page.</div>;
  }

  if (loading) {
    return <div className="page-section">Loading admin data...</div>;
  }

  if (error || !isAdmin) {
    return <div className="page-section error">{error || "You do not have permission to view this page."}</div>;
  }

  return (
    <div className="gum-page">
      <h1 className="gum-page__h1">Admin Portal</h1>

      <section className="gum-section">
        <h2 className="gum-section__title">Overview</h2>
        <div className="gum-activity-row gum-activity-row--3">
          <AdminMetricSelectCard
            menuRef={revenueMenuRef}
            menuOpen={revenueMenuOpen}
            onToggleMenu={(e) => {
              e.stopPropagation();
              setRevenueMenuOpen((open) => !open);
            }}
            menuLabel="Platform revenue view"
            triggerLabel={activeOption?.label ?? "Platform Revenue"}
            value={revenueHeadline}
            options={PLATFORM_REVENUE_OPTIONS}
            activeId={revenueView}
            onSelect={(id) => {
              setRevenueView(id as PlatformRevenueView);
              setRevenueMenuOpen(false);
            }}
          />
          <div className="gum-metric-card">
            <div className="gum-metric-card__label">Total Trade</div>
            <div className="gum-metric-card__value">{tradeHeadline}</div>
          </div>
          <div className="gum-metric-card">
            <div className="gum-metric-card__label">Total Platform Purchases</div>
            <div className="gum-metric-card__value">{data?.totalPurchases ?? 0}</div>
          </div>
        </div>
      </section>

      <section className="gum-section" style={{ marginTop: "2rem" }}>
        <h2 className="gum-section__title">Product Leaderboard</h2>
        {data?.topProducts && data.topProducts.length > 0 ? (
          <div
            className="table-responsive"
            style={{
              overflowX: "auto",
              background: "var(--header-bg)",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <table className="w-full text-left" style={{ width: "100%", borderCollapse: "collapse", color: "var(--white)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--muted)" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--purple-light)" }}>Product</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--purple-light)" }}>Buyers</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--purple-light)" }}>Revenue (USD)</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--purple-light)" }}>Revenue (SOL)</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((item, index) => (
                  <tr key={item.product?._id || index} style={{ borderBottom: "1px solid rgba(92, 77, 122, 0.3)" }}>
                    <td style={{ padding: "16px", display: "flex", alignItems: "center", gap: "16px" }}>
                      {item.product?.coverUrl ? (
                        <img
                          src={item.product.coverUrl}
                          alt=""
                          style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
                        />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--muted)" }} />
                      )}
                      <strong style={{ fontWeight: 500 }}>{item.product?.title || "Unknown Product"}</strong>
                    </td>
                    <td style={{ padding: "16px" }}>{item.buyersCount}</td>
                    <td style={{ padding: "16px" }}>${item.totalRevenueUsd.toFixed(2)}</td>
                    <td style={{ padding: "16px" }}>{item.totalRevenueSol.toFixed(4)} SOL</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="gum-footer-hint">No sales data available yet.</p>
        )}
      </section>
    </div>
  );
}

function AdminMetricSelectCard<T extends string>({
  menuRef,
  menuOpen,
  onToggleMenu,
  menuLabel,
  triggerLabel,
  value,
  options,
  activeId,
  onSelect,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  menuOpen: boolean;
  onToggleMenu: (e: ReactMouseEvent) => void;
  menuLabel: string;
  triggerLabel: string;
  value: string;
  options: { id: T; label: string }[];
  activeId: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="gum-metric-card gum-metric-card--select">
      <div className="gum-activity-currency gum-activity-currency--in-card" ref={menuRef}>
        <button
          type="button"
          className="gum-activity-currency__trigger gum-activity-currency__trigger--card"
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
        >
          <span>{triggerLabel}</span>
        </button>
        {menuOpen ? (
          <ul className="gum-activity-currency__menu" role="listbox" aria-label={menuLabel}>
            {options.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  className={`gum-activity-currency__item${activeId === opt.id ? " gum-activity-currency__item--active" : ""}`}
                  onClick={() => onSelect(opt.id)}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="gum-metric-card__value">{value}</div>
    </div>
  );
}
