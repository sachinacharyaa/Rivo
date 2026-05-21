import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { motion } from "framer-motion";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { api } from "./lib/api";
import axios from "axios";
import { isHiddenFromProductListings, isShownOnDiscover } from "./lib/hiddenProducts";
import { productPublicPath } from "./lib/productUtils";
import { ProductPriceWithLogo } from "./components/CurrencyPriceAssets";
import { FormatProductDescription } from "./lib/richDescription";
import type { ProductShape } from "./types/product";
import { TOKENS, syncTokensFromBackend } from "./config/tokens";
import { DashboardShell } from "./layouts/DashboardShell";
import { DashboardHomePage } from "./pages/dashboard/DashboardHomePage";
import { DashboardProductsPage } from "./pages/dashboard/DashboardProductsPage";
import { DashboardNewProductPage } from "./pages/dashboard/DashboardNewProductPage";
import { DashboardEditProductPage } from "./pages/dashboard/DashboardEditProductPage";
import { DashboardPaymentPage } from "./pages/dashboard/DashboardPaymentPage";
import { DashboardDiscoverPage } from "./pages/dashboard/DashboardDiscoverPage";
import { DashboardPurchasesPage } from "./pages/dashboard/DashboardPurchasesPage";

type Product = ProductShape;
type AccessFile = {
  ipfsCid?: string;
  contentUrl?: string;
  downloadUrl?: string;
  backupUrl?: string;
  fileName?: string;
  mimeType?: string;
};
type AccessPayload =
  | { mode: "direct"; contentUrl: string; fileName?: string; mimeType?: string; files?: AccessFile[] }
  | {
    mode: "ipfs_encrypted";
    ipfsCid: string;
    downloadUrl?: string;
    backupUrl?: string;
    encryptedContentKey: string;
    encryptionAlgorithm?: string;
    fileName?: string;
    mimeType?: string;
    files?: AccessFile[];
  };

function Coins() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const coins = document.querySelectorAll<HTMLElement>(".coin");
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx;
      const dy = (e.clientY - cy) / cy;
      coins.forEach((coin, i) => {
        const factor = (i + 1) * 6;
        const rx = dy * factor;
        const ry = -dx * factor;
        coin.style.setProperty("--parallax-x", `${dx * factor}px`);
        coin.style.setProperty("--parallax-y", `${dy * factor}px`);
        coin.style.setProperty("--parallax-rx", `${rx}deg`);
        coin.style.setProperty("--parallax-ry", `${ry}deg`);
      });
    };
    document.addEventListener("mousemove", handler);
    return () => document.removeEventListener("mousemove", handler);
  }, []);

  return (
    <>
      <div className="coin coin--1" aria-hidden="true">
        <div className="coin__face">R</div>
      </div>
      <div className="coin coin--2" aria-hidden="true">
        <div className="coin__face">R</div>
      </div>

      <div className="coin coin--4" aria-hidden="true">
        <div className="coin__face">R</div>
      </div>
      <div className="coin coin--5" aria-hidden="true">
        <div className="coin__face">R</div>
      </div>
      <div className="coin coin--6" aria-hidden="true">
        <div className="coin__face">R</div>
      </div>
      <div className="coin coin--7" aria-hidden="true">
        <div className="coin__face">R</div>
      </div>
    </>
  );
}

function FooterEmailSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await api.post<{ success?: boolean; message?: string }>("/subscribers", {
        email: trimmed,
      });
      setStatus("success");
      setMessage(res.data.message || "Thanks for subscribing!");
      setEmail("");
    } catch (err) {
      setStatus("error");
      if (axios.isAxiosError(err)) {
        setMessage(err.response?.data?.message || "Could not subscribe. Try again.");
      } else {
        setMessage("Could not subscribe. Try again.");
      }
    }
  };

  return (
    <div className="gr-footer-col gr-footer-col--email">
      <p className="gr-footer-email-lead">
        Subscribe for tips and growth hacks straight to your inbox.
      </p>
      <form className="gr-footer-email-form" onSubmit={handleSubmit}>
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          autoComplete="email"
          required
          disabled={status === "loading"}
          aria-label="Email address"
        />
        <button type="submit" disabled={status === "loading" || !email.trim()}>
          {status === "loading" ? "Sending…" : "Subscribe"}
        </button>
      </form>
      {message ? (
        <p
          className={`gr-footer-email-msg${status === "error" ? " gr-footer-email-msg--error" : ""}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Layout({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "dashboard";
}) {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className={variant === "dashboard" ? "page page--dashboard" : "page"}>
      <header className="site-header" id="top">
        <div className="header-left">
          <Link to="/" className="logo">
            Rivo
          </Link>
          <span className="badge">devnet</span>
        </div>
        <nav className="nav-links">
          {isHome ? (
            <>
              <Link to="/dashboard/discover">Discover</Link>
              <a href="/#features">Features</a>
              <a href="/#creators">Creators</a>
              <Link to="/dashboard/products">Products</Link>
            </>
          ) : (
            <>
              <Link to="/">Home</Link>
              <Link to="/dashboard/products">Products</Link>
              <Link to="/dashboard/home">Dashboard</Link>
            </>
          )}
        </nav>
        <div className="header-right header-right--wallet">
          <Link to="/dashboard/home" className="dashboard-button">
            Start selling
          </Link>
          <WalletMultiButton className="wallet-multi-btn" />
        </div>
      </header>
      <main
        className={
          variant === "dashboard" ? "main main--dashboard-pro" : "main"
        }
      >
        {children}
      </main>
      {variant !== "dashboard" && (
        <footer className="gr-footer">
          <div className="gr-footer-cta">
            <div className="gr-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 className="gr-title-huge" style={{ textAlign: "center", marginBottom: "24px" }}>Ready to earn?</h2>
              <p className="gr-subtitle" style={{ textAlign: "center", margin: "0 auto 40px", maxWidth: "600px" }}>
                A tasteful & useful crypto app built for creators. Connect your wallet and instantly monetize your content seamlessly on Solana.
              </p>
              <Link to="/dashboard/home" className="gr-btn gr-btn-green">
                Start selling now
              </Link>
            </div>
          </div>

          <div className="gr-footer-bottom gr-container">
            <div className="gr-footer-brand">
              <Link to="/" className="logo text-white">Rivo.</Link>
              <span className="gr-footer-desc">The Web3 creator monetization layer.</span>
            </div>
            <div className="gr-footer-links">
              <div className="gr-footer-col">
                <strong>Platform</strong>
                <Link to="/dashboard/discover">Discover</Link>
                <Link to="/dashboard/home">Dashboard</Link>
              </div>
              <div className="gr-footer-col">
                <strong>Socials</strong>
                <a href="https://x.com/rivolabsxyz" target="_blank" rel="noreferrer">X</a>
                <a href="https://discord.gg/THpac3zG5" target="_blank" rel="noreferrer">Discord</a>
              </div>
              <FooterEmailSignup />
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}


function Home() {
  return (
    <Layout>
      <section className="hero" id="discover">
        <div className="hero-coins" aria-hidden="true">
          <Coins />
        </div>
        <div className="hero-content">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="hero-tag"
          >
            Decentralized creator monetization
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="hero-title"
          >
            Make from 0 to first dollar online
          </motion.h1>
          <p className="hero-sub">
            Earn from anywhere. Sell anything. Get paid instantly.
          </p>
          <div className="hero-actions">
            <Link to="/dashboard/home" className="btn btn-primary">
              Start selling
            </Link>
            <Link to="/dashboard/discover" className="btn btn-secondary">
              Marketplace
            </Link>
          </div>
        </div>
      </section>

    </Layout>
  );
}

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Product[]>("/products")
      .then((res) => setProducts(res.data.filter((p) => isShownOnDiscover(p))))
      .catch(() => setError("Unable to load marketplace products."))
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
    <Layout>
      <section className="section" id="products">
        <div className="section-head">
          <div>
            <div className="section-kicker">Live</div>
            <h2 className="section-title">Products on Rivo</h2>
            <p className="section-sub">Only published products show up here.</p>
          </div>
          <div className="search-bar" aria-label="Search products">
            <input
              type="text"
              placeholder="Search products..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        {loading ? (
          <div className="marketplace-grid">
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <div
                className="card product-card skeleton-card"
                key={k}
                aria-hidden
              >
                <div className="skeleton-line skeleton-line--tag" />
                <div className="skeleton-line skeleton-line--title" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-line--short" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">No published products yet.</div>
        ) : (
          <div className="marketplace-grid">
            {filtered.map((product) => (
              <Link
                to={productPublicPath(product)}
                key={product._id}
                className="card product-card"
              >
                {product.thumbnailUrl ? (
                  <img
                    src={product.thumbnailUrl}
                    alt=""
                    className="product-card__thumb"
                  />
                ) : null}
                <div className="tag">Creator</div>
                <div className="card-title">{product.title}</div>
                <p className="card-meta">
                  {product.summary ? (
                    product.summary
                  ) : (
                    <FormatProductDescription text={product.description} />
                  )}
                </p>
                <div className="product-price">
                  <ProductPriceWithLogo product={product} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}

function ProductPage() {
  const { id, slug } = useParams();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const wallet = publicKey?.toBase58() ?? "";
  const [product, setProduct] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState("");
  const [accessPayload, setAccessPayload] = useState<AccessPayload | null>(null);
  const [txSignature, setTxSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const networkLabel = useMemo(() => {
    const endpoint = (connection.rpcEndpoint || "").toLowerCase();
    if (endpoint.includes("testnet")) return "testnet";
    if (endpoint.includes("mainnet")) return "mainnet";
    return "devnet";
  }, [connection.rpcEndpoint]);

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1400);
    } catch {
      setShareCopied(false);
    }
  };

  useEffect(() => {
    if (!id && !slug) return;
    const path = slug ? `/products/slug/${slug}` : `/products/${id}`;
    setLoadError("");
    setProduct(null);
    api
      .get(path)
      .then((res) => {
        if (isHiddenFromProductListings(res.data)) {
          setLoadError("Product not found.");
          return;
        }
        setProduct(res.data);
      })
      .catch(() => setLoadError("Product not found."));
  }, [id, slug]);

  useEffect(() => {
    if (!product || !wallet) return;
    api
      .post("/access/unlock", { productId: product._id, buyerWallet: wallet })
      .then((res) => setAccessPayload(res.data))
      .catch(() => undefined);
  }, [product, wallet]);

  const makeVerifiedDownloadHref = (fileIndex = 0) => {
    if (!product || !wallet) return "";
    if (!api.defaults.baseURL) return "";
    try {
      return axios.getUri({
        baseURL: api.defaults.baseURL,
        url: "/access/download-file",
        params: { productId: product._id, buyerWallet: wallet, fileIndex },
      });
    } catch {
      return "";
    }
  };

  const buy = async () => {
    if (!product) return;
    setError("");
    setStatus("");
    setTxSignature("");

    if (!publicKey) {
      setError("Connect your wallet first (header or wallet button).");
      return;
    }

    setBusy(true);
    try {
      const buyerWallet = publicKey.toBase58();
      const creatorAddress = product.payoutWallet || product.creatorWallet;
      const cur = product.currency ?? "PUSD";
      if (cur === "PUSD" && (!product.price || product.price <= 0)) {
        throw new Error("Invalid PUSD price for this product.");
      }
      if (cur === "SOL" && (!Number.isFinite(product.priceSol) || (product.priceSol ?? 0) <= 0)) {
        throw new Error("Invalid SOL price for this product.");
      }
      if (cur === "USDC" && (product.priceUsdc ?? 0) <= 0) {
        throw new Error("Invalid USDC price for this product.");
      }

      setStatus("Awaiting wallet approval...");
      let signature = "";
      if (cur === "SOL") {
        const { handlePayment } = await import("./lib/payment");
        signature = await handlePayment({
          connection,
          wallet: { publicKey, sendTransaction },
          productPriceSol: product.priceSol ?? 0,
          creatorAddress,
        });
      } else if (cur === "PUSD") {
        const { handleTokenPayment } = await import("./lib/tokenPayment");
        signature = await handleTokenPayment({
          connection,
          wallet: { publicKey, sendTransaction },
          mintAddress: TOKENS.PUSD.mint,
          amount: Math.round(product.price ?? 0),
          creatorAddress,
        });
      } else if (cur === "USDC") {
        const { handleTokenPayment } = await import("./lib/tokenPayment");
        signature = await handleTokenPayment({
          connection,
          wallet: { publicKey, sendTransaction },
          mintAddress: TOKENS.USDC.mint,
          amount: Math.round((product.priceUsdc ?? 0) * 10 ** TOKENS.USDC.decimals),
          creatorAddress,
        });
      } else {
        throw new Error(`Unsupported currency: ${cur}`);
      }

      setTxSignature(signature);
      setStatus("Verifying on-chain payment...");
      await api.post("/purchases/verify", {
        productId: product._id,
        buyerWallet,
        txSignature: signature,
        currency: product.currency ?? "PUSD",
        paymentMode: "public",
      });

      setStatus("Unlocking content...");
      const access = await api.post("/access/unlock", {
        productId: product._id,
        buyerWallet,
      });
      setAccessPayload(access.data);
      setStatus("Unlocked! Enjoy your content.");
    } catch (e) {
      setStatus("");
      if (axios.isAxiosError(e)) {
        const data = e.response?.data as { message?: string; error?: string } | undefined;
        setError(data?.message || data?.error || e.message);
      } else if (e instanceof Error) {
        setError(e.message || `Payment failed. Make sure your wallet is connected to ${networkLabel} and try again.`);
      } else {
        setError(`Payment failed. Make sure your wallet is connected to ${networkLabel} and try again.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const unlockFiles: AccessFile[] = useMemo(() => {
    if (!accessPayload) return [];
    if (Array.isArray(accessPayload.files) && accessPayload.files.length > 0) {
      return accessPayload.files;
    }
    if (accessPayload.mode === "direct") {
      return [
        {
          contentUrl: accessPayload.contentUrl,
          fileName: accessPayload.fileName,
          mimeType: accessPayload.mimeType,
        },
      ];
    }
    return [
      {
        ipfsCid: accessPayload.ipfsCid,
        downloadUrl: accessPayload.downloadUrl,
        backupUrl: accessPayload.backupUrl,
        fileName: accessPayload.fileName,
        mimeType: accessPayload.mimeType,
      },
    ];
  }, [accessPayload]);

  if (loadError) {
    return (
      <Layout>
        <section className="page-section">
          <div className="error">{loadError}</div>
        </section>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <section className="page-section">
          <div className="empty">Loading product...</div>
        </section>
      </Layout>
    );
  }

  const explorerProofUrl = txSignature
    ? `https://explorer.solana.com/tx/${txSignature}?cluster=${networkLabel}`
    : "";

  return (
    <Layout>
      <section className="page-section">
        <div className="product-public-card">
          <div className="product-public-media">
            {product.coverUrl || product.thumbnailUrl ? (
              <img src={product.coverUrl || product.thumbnailUrl} alt={product.title} />
            ) : (
              <div className="product-public-media__ph">No image</div>
            )}
          </div>

          <div className="product-public-panel">
            <div className="product-public-header">
              <div className="product-public-title-row">
                <h2 className="product-public-title">{product.title}</h2>
                <button
                  className="product-public-share-btn"
                  type="button"
                  aria-label="Share product link"
                  onClick={copyShareLink}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    aria-hidden="true"
                  >
                    <path
                      d="M384 192c53 0 96-43 96-96s-43-96-96-96-96 43-96 96c0 5.4 .5 10.8 1.3 16L159.6 184.1c-16.9-15-39.2-24.1-63.6-24.1-53 0-96 43-96 96s43 96 96 96c24.4 0 46.6-9.1 63.6-24.1L289.3 400c-.9 5.2-1.3 10.5-1.3 16 0 53 43 96 96 96s96-43 96-96-43-96-96-96c-24.4 0-46.6 9.1-63.6 24.1L190.7 272c.9-5.2 1.3-10.5 1.3-16s-.5-10.8-1.3-16l129.7-72.1c16.9 15 39.2 24 63.6 24z"
                      fill="currentColor"
                    />
                  </svg>
                  <span>{shareCopied ? "Copied" : "Share"}</span>
                </button>
              </div>
              <div className="product-public-price">
                <ProductPriceWithLogo product={product} />
              </div>
            </div>

            <div className="product-public-actions">
              {!accessPayload && (
                <button className="btn btn-outline" type="button">
                  Add to cart
                </button>
              )}
              {!accessPayload && (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={buy}
                  type="button"
                >
                  {busy ? "Processing..." : "Buy now"}
                </button>
              )}
            </div>

            {status && !error ? (
              <div className="product-public-toast product-public-toast--info">
                {status}
              </div>
            ) : null}
            {error ? (
              <div className="product-public-toast product-public-toast--error">
                {error}
              </div>
            ) : null}
            {accessPayload ? (
              <div className="product-public-unlock product-public-unlock--hero">
                <div className="product-public-unlock__head">
                  <div>
                    <div className="tag tag--success">Access unlocked</div>
                    <p className="product-public-unlock__title">
                      Your content link is ready.
                    </p>
                  </div>
                  {txSignature ? (
                    <a
                      className="product-public-proof"
                      href={explorerProofUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Transaction proof
                    </a>
                  ) : null}
                </div>
                <div className="product-public-unlock__actions">
                  {unlockFiles.map((file, idx) => {
                    const rawHref =
                      file.contentUrl ||
                      file.downloadUrl ||
                      file.backupUrl ||
                      (file.ipfsCid ? `https://ipfs.io/ipfs/${file.ipfsCid}` : "");
                    const verifiedHref = makeVerifiedDownloadHref(idx);
                    const downloadHref = verifiedHref || rawHref;
                    const downloadName = file.fileName || `${product.title}-${idx + 1}`;
                    return (
                      <a
                        key={`${downloadName}-${idx}`}
                        className="btn btn-secondary"
                        href={downloadHref || "#"}
                        download={downloadName}
                        rel="noreferrer"
                      >
                        Download {unlockFiles.length > 1 ? `file ${idx + 1}` : "file"}
                      </a>
                    );
                  })}
                  {txSignature ? (
                    <a
                      className="btn btn-outline"
                      href={explorerProofUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on explorer
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="product-public-copy">
              {product.summary ? (
                <p className="product-summary">{product.summary}</p>
              ) : null}
              <p className="product-public-desc">
                <FormatProductDescription text={product.description} />
              </p>
            </div>

            {product.productInfo ? (
              <div className="product-info-block">
                <div className="tag">What you get</div>
                <p className="section-sub">{product.productInfo}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </Layout>
  );
}

function RouteAnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    const pathWithQuery = `${location.pathname}${location.search}`;
    const dedupeKey = `Rivo_analytics_seen_${pathWithQuery}`;
    if (sessionStorage.getItem(dedupeKey)) return;
    sessionStorage.setItem(dedupeKey, "1");

    void api.post("/analytics/track", {
      path: location.pathname,
      referrer: document.referrer || "",
    });
  }, [location.pathname, location.search]);

  return null;
}

export function App() {
  useEffect(() => {
    void syncTokensFromBackend();
  }, []);

  return (
    <>
      <RouteAnalyticsTracker />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/dashboard" element={<DashboardShell />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<DashboardHomePage />} />
          <Route path="products" element={<DashboardProductsPage />} />
          <Route path="products/new" element={<DashboardNewProductPage />} />
          <Route path="products/:id/edit" element={<DashboardEditProductPage />} />
          <Route path="payment" element={<DashboardPaymentPage />} />
          <Route path="purchases" element={<DashboardPurchasesPage />} />
          <Route path="discover" element={<DashboardDiscoverPage />} />
        </Route>
        <Route path="/p/:id" element={<ProductPage />} />
        <Route path="/:slug" element={<ProductPage />} />
      </Routes>
    </>
  );
}
