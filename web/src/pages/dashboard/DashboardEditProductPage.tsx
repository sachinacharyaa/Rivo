import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import axios from "axios";
import { api } from "../../lib/api";
import { CRYPTO_OPTIONS, formatProductPrice, readFileAsDataUrl } from "../../lib/productUtils";
import { FormatProductDescription } from "../../lib/richDescription";
import type { ProductShape } from "../../types/product";

export function DashboardEditProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [productType, setProductType] = useState("digital");
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    productInfo: "",
    currency: "SOL" as "SOL" | "USDC" | "AUDD",
    priceAmount: "",
    coverUrl: "",
  });

  useEffect(() => {
    if (!id || !wallet) return;
    setLoading(true);
    setError("");
    api
      .get<ProductShape>(`/products/${id}/owner/${wallet}`)
      .then((res) => {
        const p = res.data;
        setDraft({
          name: p.title || "",
          description: p.description || "",
          productInfo: p.productInfo || "",
          currency: p.currency || "SOL",
          priceAmount: String(
            p.currency === "USDC"
              ? p.priceUsdc ?? 0
              : p.currency === "AUDD"
                ? p.priceAudd ?? 0
                : p.priceSol ?? 0,
          ),
          coverUrl: p.coverUrl || "",
        });
        setContentUrl(p.contentUrl || "");
        setStatus((p.status as "draft" | "published") || "draft");
        setProductType(p.productType || "digital");
      })
      .catch(() => setError("Could not load this product for editing."))
      .finally(() => setLoading(false));
  }, [id, wallet]);

  const previewProduct = useMemo(
    () => ({
      currency: draft.currency,
      priceSol: draft.currency === "SOL" ? Number(draft.priceAmount) || 0 : 0,
      priceUsdc: draft.currency === "USDC" ? Number(draft.priceAmount) || 0 : 0,
      priceAudd: draft.currency === "AUDD" ? Number(draft.priceAmount) || 0 : 0,
    }),
    [draft.currency, draft.priceAmount],
  );

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!wallet || !id) {
      setError("Connect your wallet first.");
      return;
    }
    if (draft.name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (draft.description.trim().length < 5) {
      setError("Description must be at least 5 characters.");
      return;
    }
    if (Number(draft.priceAmount) <= 0) {
      setError("Price must be greater than 0.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    const amount = Number(draft.priceAmount);
    try {
      await api.put(`/products/${id}`, {
        creatorWallet: wallet,
        title: draft.name.trim(),
        description: draft.description.trim(),
        productInfo: draft.productInfo.trim() || undefined,
        coverUrl: draft.coverUrl || undefined,
        thumbnailUrl: draft.coverUrl || undefined,
        currency: draft.currency,
        priceSol: draft.currency === "SOL" ? amount : 0,
        priceUsdc: draft.currency === "USDC" ? amount : 0,
        priceAudd: draft.currency === "AUDD" ? amount : 0,
        contentUrl: contentUrl,
        productType: productType,
        status,
      });
      setNotice("Product updated successfully.");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string; issues?: { message?: string }[] } | undefined;
        if (data?.issues?.length) setError(data.issues[0]?.message || "Invalid data.");
        else setError(data?.message || "Could not update product.");
      } else {
        setError("Could not update product.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!wallet) return <div className="gum-muted">Connect your wallet to edit products.</div>;
  if (loading) return <div className="gum-muted">Loading editor…</div>;

  return (
    <div className="gum-page gum-page--wide">
      <div className="gum-new-top">
        <div>
          <h1 className="gum-page__h1">Edit product</h1>
          <p className="gum-page__lead">Refine your product name, pricing, description, and images.</p>
        </div>
        <div className="gum-new-top__actions">
          <Link to="/dashboard/products" className="gum-btn gum-btn--ghost">
            Back
          </Link>
          <button type="submit" form="form-edit-product" className="gum-btn gum-btn--pink" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="gum-customize-layout">
        <form id="form-edit-product" className="gum-customize-form" onSubmit={save}>
          <div className="gum-field">
            <label className="gum-label">Name</label>
            <input
              className="gum-input"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div className="gum-field">
            <label className="gum-label">Description</label>
            <textarea
              className="gum-textarea"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={7}
            />
          </div>
          <div className="gum-field">
            <label className="gum-label">Price</label>
            <div className="dash-price-bar gum-price-bar">
              <div className="dash-price-bar__left">
                <select
                  className="dash-currency-trigger"
                  value={draft.currency}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, currency: e.target.value as "SOL" | "USDC" | "AUDD" }))
                  }
                >
                  {CRYPTO_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.symbol} {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                className="dash-price-bar__input"
                type="number"
                min="0"
                step="any"
                value={draft.priceAmount}
                onChange={(e) => setDraft((d) => ({ ...d, priceAmount: e.target.value }))}
              />
            </div>
          </div>
          <div className="gum-field">
            <label className="gum-label">Product info</label>
            <textarea
              className="gum-textarea"
              value={draft.productInfo}
              onChange={(e) => setDraft((d) => ({ ...d, productInfo: e.target.value }))}
              rows={4}
            />
          </div>
          <div className="gum-field">
            <label className="gum-label">Cover image</label>
            <div className="dash-dropzone gum-dropzone">
              {draft.coverUrl ? <img src={draft.coverUrl} alt="" className="dash-preview-img dash-preview-img--full" /> : <span className="dash-dropzone__plus">+</span>}
              <input
                type="file"
                accept="image/*"
                className="dash-file-input"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const dataUrl = await readFileAsDataUrl(f);
                    setDraft((d) => ({ ...d, coverUrl: dataUrl }));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Upload failed");
                  }
                }}
              />
            </div>
          </div>
          {error ? <div className="dash-alert dash-alert--error">{error}</div> : null}
          {notice ? <div className="dash-alert dash-alert--ok">{notice}</div> : null}
        </form>

        <aside className="gum-preview-col">
          <div className="gum-preview-title">Preview</div>
          <div className="dash-preview-card gum-preview-live">
            <div className="dash-preview-card__cover">
              {draft.coverUrl ? <img src={draft.coverUrl} alt="" /> : <span className="dash-preview-card__cover-ph">+</span>}
            </div>
            <div className="dash-preview-card__body">
              <div className="dash-preview-card__title">{draft.name || "Product"}</div>
              <div className="dash-preview-card__price">{formatProductPrice(previewProduct)}</div>
              <p className="dash-preview-card__summary">
                {draft.description ? <FormatProductDescription text={draft.description} /> : "Description preview"}
              </p>
            </div>
          </div>
          <div style={{ marginTop: "12px" }}>
            <button type="button" className="gum-btn gum-btn--ghost" onClick={() => navigate("/dashboard/products")}>
              Done
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
