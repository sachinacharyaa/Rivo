import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { api } from "../../lib/api";

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
  totalPurchases: number;
  topProducts: TopProduct[];
};

export function DashboardAdminPage() {
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

    api.get<LeaderboardData>("/admin/leaderboard", { params: { wallet: walletAddress } })
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.message || "Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }, [walletAddress, isAdmin]);

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
    <div className="page-section">
      <h1 className="section-title">Admin Portal</h1>
      <p className="section-sub mb-8">View platform revenue and product leaderboard</p>
      
      <div className="marketplace-grid mb-8">
        <div className="card">
          <div className="card-title">Total Platform Revenue (USD)</div>
          <div className="gr-title-large mt-2">${data?.totalPlatformRevenueUsd.toFixed(2)}</div>
          <p className="card-meta mt-1">1% fee on PUSD/USDC sales</p>
        </div>
        <div className="card">
          <div className="card-title">Total Platform Revenue (SOL)</div>
          <div className="gr-title-large mt-2">{data?.totalPlatformRevenueSol.toFixed(4)} SOL</div>
          <p className="card-meta mt-1">1% fee on SOL sales</p>
        </div>
        <div className="card">
          <div className="card-title">Total Platform Purchases</div>
          <div className="gr-title-large mt-2">{data?.totalPurchases}</div>
          <p className="card-meta mt-1">Across all products</p>
        </div>
      </div>

      <h2 className="gr-title-large mt-10 mb-4">Product Leaderboard</h2>
      {data?.topProducts && data.topProducts.length > 0 ? (
        <div className="table-responsive">
          <table className="w-full text-left" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--cream)' }}>
                <th style={{ padding: '12px 0' }}>Product</th>
                <th style={{ padding: '12px 0' }}>Buyers</th>
                <th style={{ padding: '12px 0' }}>Revenue (USD)</th>
                <th style={{ padding: '12px 0' }}>Revenue (SOL)</th>
              </tr>
            </thead>
            <tbody>
              {data.topProducts.map((item, index) => (
                <tr key={item.product?._id || index} style={{ borderBottom: '1px solid var(--cream)' }}>
                  <td style={{ padding: '12px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {item.product?.coverUrl ? (
                      <img src={item.product.coverUrl} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 4, background: 'var(--cream)' }} />
                    )}
                    <strong>{item.product?.title || "Unknown Product"}</strong>
                  </td>
                  <td style={{ padding: '12px 0' }}>{item.buyersCount}</td>
                  <td style={{ padding: '12px 0' }}>${item.totalRevenueUsd.toFixed(2)}</td>
                  <td style={{ padding: '12px 0' }}>{item.totalRevenueSol.toFixed(4)} SOL</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No sales data available yet.</p>
      )}
    </div>
  );
}
