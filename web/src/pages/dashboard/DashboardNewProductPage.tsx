import { type ClipboardEvent, type DragEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { api } from "../../lib/api";
import { FormatProductDescription, descriptionToHtml } from "../../lib/richDescription";
import { readFileAsDataUrl } from "../../lib/productUtils";
import { PriceFieldLabel, ProductPriceWithLogo } from "../../components/CurrencyPriceAssets";
import { productPublicUrl } from "../../lib/productUtils";
import { CRYPTO_OPTIONS, type ProductCurrency } from "../../lib/productUtils";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ProductShape } from "../../types/product";
import { TOKENS } from "../../config/tokens";
import { uploadProductDeliveryFiles } from "../../lib/productFileUpload";

type DigitalProductUploadResponse = {
  deliveryMode: "ipfs_encrypted";
  ipfsCid: string;
  downloadUrl: string;
  backupUrl: string;
  encryptedContentKey: string;
  encryptionAlgorithm: string;
  fileName: string;
  mimeType: string;
  files: {
    ipfsCid: string;
    downloadUrl: string;
    backupUrl: string;
    fileName: string;
    mimeType: string;
  }[];
};

const PRODUCT_TYPES = [
  { id: "digital", title: "Digital product", desc: "Files, templates, presets, or downloads.", emoji: "📦" },
  { id: "course", title: "Course or tutorial", desc: "Structured lessons buyers unlock.", emoji: "🎓" },
  { id: "ebook", title: "E-book", desc: "Long-form written content.", emoji: "📖" },
  { id: "membership", title: "Membership", desc: "Recurring access to your work.", emoji: "⭐" },
  { id: "bundle", title: "Bundle", desc: "Multiple products in one.", emoji: "🎁" },
];

const SERVICE_TYPES = [
  { id: "commission", title: "Commission", desc: "Custom work for buyers.", emoji: "✏️" },
  { id: "call", title: "Call", desc: "Scheduled calls.", emoji: "📞" },
  { id: "coffee", title: "Coffee", desc: "Support tips.", emoji: "☕" },
];

/** Matches backend `multer` max files per product. */
const MAX_PRODUCT_FILES = 10;

export function DashboardNewProductPage() {
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? "";
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdProduct, setCreatedProduct] = useState<ProductShape | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [copied, setCopied] = useState(false);
  const [payoutWallet, setPayoutWallet] = useState("");
  const [toolbarState, setToolbarState] = useState({ bold: false, italic: false, underline: false });
  const [draft, setDraft] = useState({
    name: "",
    productType: "digital",
    currency: "PUSD" as ProductCurrency,
    priceAmount: "",
    description: "",
    productInfo: "",
    coverUrl: "",
  });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const saved = localStorage.getItem("Rivo_payout_wallet");
    if (saved) setPayoutWallet(saved);
  }, []);

  const canStep1 = draft.name.trim().length >= 2 && draft.productType && Number(draft.priceAmount) > 0;
  const canStep2 =
    draft.name.trim().length >= 2 &&
    draft.description.trim().length >= 5 &&
    files.length > 0;

  const goCustomize = () => {
    if (!canStep1) {
      setError("Add a name, pick a product type, and set a valid price.");
      return;
    }
    setError("");
    setStep(2);
  };

  const publish = async (e: FormEvent) => {
    e.preventDefault();
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }
    if (!canStep2) {
      setError("Add description and upload at least one product file.");
      return;
    }
    setSubmitting(true);
    setError("");
    const price = Number(draft.priceAmount);
    const smallestUnitPrice =
      draft.currency === "PUSD" ? Math.round(price * 10 ** TOKENS.PUSD.decimals) : 0;
    try {
      const uploadRes = await uploadProductDeliveryFiles(files);

      const { data } = await api.post<ProductShape>("/products", {
        title: draft.name.trim(),
        description: draft.description.trim(),
        productInfo: draft.productInfo.trim() || undefined,
        deliveryMode: uploadRes.data.deliveryMode,
        ipfsCid: uploadRes.data.ipfsCid,
        encryptedContentKey: uploadRes.data.encryptedContentKey,
        encryptionAlgorithm: uploadRes.data.encryptionAlgorithm,
        fileName: uploadRes.data.fileName,
        mimeType: uploadRes.data.mimeType,
        deliveryFiles: (uploadRes.data.files || []).map((file) => ({
          ipfsCid: file.ipfsCid,
          contentUrl: file.downloadUrl || file.backupUrl,
          fileName: file.fileName,
          mimeType: file.mimeType,
        })),
        contentUrl: uploadRes.data.downloadUrl || uploadRes.data.backupUrl,
        coverUrl: draft.coverUrl || undefined,
        thumbnailUrl: draft.coverUrl || undefined,
        currency: draft.currency,
        price: smallestUnitPrice,
        priceSol: draft.currency === "SOL" ? price : 0,
        priceUsdc: draft.currency === "USDC" ? price : 0,
        productType: draft.productType,
        creatorWallet: wallet,
        payoutWallet: payoutWallet || undefined,
        status: "draft",
      });
      const published = await api.post<ProductShape>(`/products/${data._id}/publish`);
      setCreatedProduct(published.data);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("Rivo_gs_share", "1");
      }
      setStep(3);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string; issues?: { message?: string }[] } | undefined;
        if (!err.response) {
          setError("API is unreachable. Check your API deployment and VITE_API_URL configuration.");
        } else if (data?.issues?.length) {
          setError(data.issues[0]?.message || "Invalid data. Please review the fields.");
        } else {
          setError(data?.message || "Could not publish. Check fields and try again.");
        }
      } else {
        setError(err instanceof Error ? err.message : "Could not publish. Check fields and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = () => {
    if (!createdProduct) return;
    void navigator.clipboard.writeText(productPublicUrl(createdProduct));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fileLooksFromFolderDrop = (f: File) => {
    const p = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
    return typeof p === "string" && p.length > 0;
  };

  const appendFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const picked = Array.from(incoming);
    if (picked.some(fileLooksFromFolderDrop)) {
      setError("Folders cannot be uploaded. Add files only.");
      return;
    }
    setError("");
    setFiles((prev) => {
      const room = MAX_PRODUCT_FILES - prev.length;
      if (room <= 0) return prev;
      return [...prev, ...picked.slice(0, room)];
    });
  };

  const onDropFiles = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const { items } = e.dataTransfer;
    if (items?.length) {
      for (let i = 0; i < items.length; i += 1) {
        const entry = items[i]?.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          setError("Folders cannot be uploaded. Add files only.");
          return;
        }
      }
    }
    appendFiles(e.dataTransfer.files);
  };

  

  const htmlToMarkdown = (root: HTMLElement): string => {
    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent ?? "").replace(/\u00a0/g, " ");
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const inner = Array.from(el.childNodes).map(walk).join("");
      switch (tag) {
        case "strong":
        case "b":
          return `**${inner}**`;
        case "em":
        case "i":
          return `*${inner}*`;
        case "u":
          return `__${inner}__`;
        case "br":
          return "\n";
        case "div":
        case "p":
          return inner + "\n";
        default:
          return inner;
      }
    };

    const raw = Array.from(root.childNodes).map(walk).join("");
    return raw
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n+$/g, "");
  };

  const syncDescriptionFromEditor = () => {
    const el = descriptionRef.current;
    if (!el) return;
    const markdown = htmlToMarkdown(el);
    setDraft((d) => ({ ...d, description: markdown }));
  };

  const syncToolbarState = () => {
    const root = descriptionRef.current;
    if (!root) return;
    const sel = document.getSelection();
    if (!sel) return;
    const anchor = sel.anchorNode;
    const focus = sel.focusNode;
    const withinEditor = (node: Node | null) => (node ? root.contains(node) : false);
    if (!withinEditor(anchor) && !withinEditor(focus)) return;
    setToolbarState({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  };

  const applyBold = () => {
    descriptionRef.current?.focus();
    document.execCommand("bold");
    syncDescriptionFromEditor();
    syncToolbarState();
  };
  const applyItalic = () => {
    descriptionRef.current?.focus();
    document.execCommand("italic");
    syncDescriptionFromEditor();
    syncToolbarState();
  };
  const applyUnderline = () => {
    descriptionRef.current?.focus();
    document.execCommand("underline");
    syncDescriptionFromEditor();
    syncToolbarState();
  };

  const editorInitialized = useRef(false);

  useEffect(() => {
    if (step !== 2) {
      editorInitialized.current = false;
      return;
    }
    const el = descriptionRef.current;
    if (!el || editorInitialized.current) return;
    el.innerHTML = descriptionToHtml(draft.description);
    editorInitialized.current = true;
    syncToolbarState();
  }, [step, draft.description]);

  const onEditorInput = () => {
    syncDescriptionFromEditor();
    syncToolbarState();
  };

  const onEditorPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    syncToolbarState();
  };

  useEffect(() => {
    if (step !== 2) return;
    const onSelection = () => syncToolbarState();
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [step]);

  const previewProduct: Pick<
    ProductShape,
    "currency" | "price" | "priceSol" | "priceUsdc"
  > = {
    currency: draft.currency,
    price:
      draft.currency === "PUSD"
        ? Math.round((Number(draft.priceAmount) || 0) * 10 ** TOKENS.PUSD.decimals)
        : 0,
    priceSol: draft.currency === "SOL" ? Number(draft.priceAmount) || 0 : 0,
    priceUsdc: draft.currency === "USDC" ? Number(draft.priceAmount) || 0 : 0,
  };

  return (
    <div className="gum-page gum-page--wide">
      <div className="gum-new-top">
        <div>
          <h1 className="gum-page__h1">
            {step === 1 ? "What are you creating?" : step === 2 ? draft.name || "New product" : "Share your product"}
          </h1>
          {step === 1 ? (
            <p className="gum-page__lead">
              Turn your idea into a live product in minutes. Start with a name, type, and price — then customize how it looks.
            </p>
          ) : null}
        </div>
        <div className="gum-new-top__actions">
          {step === 1 ? (
            <>
              <button type="button" className="gum-btn gum-btn--ghost" onClick={() => navigate("/dashboard/products")}>
                Cancel
              </button>
              <button type="button" className="gum-btn gum-btn--pink" onClick={goCustomize} disabled={!canStep1}>
                Next: Customize
              </button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <button type="button" className="gum-btn gum-btn--ghost" onClick={() => navigate("/dashboard/products")}>
                Cancel
              </button>
              <button type="submit" form="form-customize" className="gum-btn gum-btn--pink" disabled={submitting || !canStep2}>
                {submitting ? "Saving…" : "Next: Share"}
              </button>
            </>
          ) : null}
          {step === 3 ? (
            <Link to="/dashboard/products" className="gum-btn gum-btn--ghost">
              Back to products
            </Link>
          ) : null}
        </div>
      </div>

      {step === 1 ? (
        <>
        <div className="gum-new-grid">
          <aside className="gum-new-aside">
            <p className="gum-muted">
              Need help adding a product? Use a clear title, pick the closest type, and set your listing price.
            </p>
            <a href="https://github.com/sachinacharyaa/Rivo" className="gum-link" target="_blank" rel="noreferrer">
              View docs
            </a>
          </aside>
          <div className="gum-new-main">
            <div className="gum-field">
              <label className="gum-label">Name</label>
              <input
                className="gum-input"
                placeholder="Name of product"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>

            <div className="gum-field">
              <span className="gum-label">Products</span>
              <div className="gum-type-grid">
                {PRODUCT_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`gum-type-card${draft.productType === t.id ? " gum-type-card--selected" : ""}`}
                    onClick={() => setDraft((d) => ({ ...d, productType: t.id }))}
                  >
                    <span className="gum-type-card__emoji">{t.emoji}</span>
                    <div className="gum-type-card__title">{t.title}</div>
                    <p className="gum-type-card__desc">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="gum-field">
              <span className="gum-label gum-label--dim">Services (coming soon)</span>
              <div className="gum-type-grid gum-type-grid--dim">
                {SERVICE_TYPES.map((t) => (
                  <div key={t.id} className="gum-type-card gum-type-card--disabled">
                    <span className="gum-type-card__emoji">{t.emoji}</span>
                    <div className="gum-type-card__title">{t.title}</div>
                    <p className="gum-type-card__desc">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="gum-field">
              <label className="gum-label">
                <PriceFieldLabel currency={draft.currency} />
              </label>
              <div className="dash-price-bar gum-price-bar">
                <div className="dash-price-bar__left">
                  <select
                    className="dash-currency-select"
                    value={draft.currency}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        currency: e.target.value as ProductCurrency,
                      }))
                    }
                    aria-label="Select listing currency"
                  >
                    {CRYPTO_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.code}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  className="dash-price-bar__input"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Price your product"
                  value={draft.priceAmount}
                  onChange={(e) => setDraft((d) => ({ ...d, priceAmount: e.target.value }))}
                />
              </div>
            </div>

            {error ? <div className="dash-alert dash-alert--error">{error}</div> : null}
          </div>
        </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
        <div className="gum-customize-layout">
          <div className="gum-customize-form">
            <div className="gum-workflow-tabs">
              <span className="gum-workflow-tab gum-workflow-tab--active">Product</span>
              <span className="gum-workflow-tab">Share</span>
            </div>

            <form id="form-customize" onSubmit={publish}>
              <div className="gum-field">
                <label className="gum-label">Name</label>
                <input className="gum-input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} required minLength={2} />
              </div>
              <div className="gum-field">
                <label className="gum-label">Description</label>
                <div className="dash-editor-toolbar">
                  <button
                    type="button"
                    className={`dash-editor-toolbar__btn${toolbarState.bold ? " dash-editor-toolbar__btn--active" : ""}`}
                    title="Bold"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={applyBold}
                    aria-pressed={toolbarState.bold}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    className={`dash-editor-toolbar__btn dash-editor-toolbar__btn--italic${toolbarState.italic ? " dash-editor-toolbar__btn--active" : ""}`}
                    title="Italic"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={applyItalic}
                    aria-pressed={toolbarState.italic}
                  >
                    I
                  </button>
                  <button
                    type="button"
                    className={`dash-editor-toolbar__btn dash-editor-toolbar__btn--underline${toolbarState.underline ? " dash-editor-toolbar__btn--active" : ""}`}
                    title="Underline"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={applyUnderline}
                    aria-pressed={toolbarState.underline}
                  >
                    U
                  </button>
                </div>
                <div
                  ref={descriptionRef}
                  className="gum-rich-editor"
                  role="textbox"
                  aria-multiline="true"
                  data-placeholder="Describe your product…"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={onEditorInput}
                  onBlur={syncDescriptionFromEditor}
                  onPaste={onEditorPaste}
                  onKeyUp={syncToolbarState}
                  onMouseUp={syncToolbarState}
                  onFocus={syncToolbarState}
                />
              </div>
              <div className="gum-field">
                <label className="gum-label">Cover</label>
                <div className="dash-dropzone gum-dropzone">
                  {draft.coverUrl ? (
                    <img src={draft.coverUrl} alt="" className="dash-preview-img dash-preview-img--full" />
                  ) : (
                    <span className="dash-dropzone__plus" aria-hidden>
                      +
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="dash-file-input"
                    aria-label="Upload cover image"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setError("");
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
              <div className="gum-field">
                <label className="gum-label">Product info</label>
                <textarea
                  className="gum-textarea"
                  placeholder="What buyers get, file formats, access details…"
                  value={draft.productInfo}
                  onChange={(e) => setDraft((d) => ({ ...d, productInfo: e.target.value }))}
                  rows={4}
                />
              </div>
              <div className="gum-field">
                <label className="gum-label">Upload Files</label>
                <div
                  className="gum-dropzone"
                  style={{ position: "relative" }}
                  onDrop={onDropFiles}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <div className="gum-muted">Drag & drop files here</div>
                  <div className="gum-muted" style={{ margin: "12px 0 8px" }}>
                    or
                  </div>
                  <label className="gum-btn gum-btn--ghost" style={{ position: "relative", cursor: "pointer", margin: 0 }}>
                    Add files
                    <input
                      className="dash-file-input"
                      type="file"
                      multiple
                      aria-label="Add product files"
                      onChange={(e) => {
                        appendFiles(e.target.files);
                        e.target.value = "";
                      }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        opacity: 0,
                        cursor: "pointer",
                        width: "100%",
                        height: "100%",
                      }}
                    />
                  </label>
                </div>
                {files.length > 0 ? (
                  <div className="gum-muted" style={{ marginTop: "10px" }}>
                    {files.map((f, idx) => (
                      <div
                        key={`${f.name}-${idx}`}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}
                      >
                        <span>{f.name}</span>
                        <button
                          type="button"
                          className="gum-btn gum-btn--ghost"
                          onClick={() =>
                            setFiles((prev) => prev.filter((_, fileIdx) => fileIdx !== idx))
                          }
                          aria-label={`Remove ${f.name}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {error ? <div className="dash-alert dash-alert--error">{error}</div> : null}
            </form>
          </div>
          <aside className="gum-preview-col">
            <div className="gum-preview-title">Preview</div>
            <div className="dash-preview-card gum-preview-live">
              <div className="dash-preview-card__cover">
                {draft.coverUrl ? <img src={draft.coverUrl} alt="" /> : <span className="dash-preview-card__cover-ph">+</span>}
              </div>
              <div className="dash-preview-card__body">
                <div className="dash-preview-card__title">{draft.name || "Product"}</div>
                <div className="dash-preview-card__price">
                  <ProductPriceWithLogo product={previewProduct} />
                </div>
                <p className="dash-preview-card__summary">
                  {draft.description ? (
                    <FormatProductDescription text={draft.description} />
                  ) : (
                    "Description preview"
                  )}
                </p>
                {draft.productInfo ? <p className="dash-preview-card__note dash-preview-card__note--inline">{draft.productInfo}</p> : null}
              </div>
              <p className="dash-preview-card__note">
                Buyers see this page after checkout. Default listing currency is PUSD, but you can choose others.
              </p>
            </div>
          </aside>
        </div>
        </>
      ) : null}

      {step === 3 && createdProduct ? (
        <div className="gum-share-panel">
          <p className="gum-share-lead">Your product is live. Share this link anywhere — buyers get the full product page with cover, price, and buy flow.</p>
          <div className="gum-share-url-row">
            <code className="gum-share-url">{productPublicUrl(createdProduct)}</code>
            <button type="button" className="gum-btn gum-btn--pink" onClick={copyLink}>
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
          <div className="gum-share-actions">
            <a href={productPublicUrl(createdProduct)} target="_blank" rel="noreferrer" className="gum-btn gum-btn--ghost">
              Open buyer page
            </a>
            <Link to="/dashboard/products" className="gum-link">
              Return to products
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
