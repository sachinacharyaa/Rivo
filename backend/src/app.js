import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import multer from "multer";
import crypto from "crypto";
import { verifySolTransfer, verifySplSplitTransfer } from "./verifyTransfer.js";
import { Readable } from "node:stream";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const connection = new Connection(process.env.SOLANA_RPC || "https://api.devnet.solana.com", "confirmed");
const RIPPLE_FEE_WALLET = process.env.RIPPLE_FEE_WALLET || "G6DKYcQnySUk1ZYYuR1HMovVscWjAtyDQb6GhqrvJYnw";
const IPFS_HOST = process.env.IPFS_API_HOST || "127.0.0.1";
const IPFS_PORT = Number(process.env.IPFS_API_PORT || 5001);
const IPFS_PROTOCOL = process.env.IPFS_API_PROTOCOL || "http";
const PINATA_JWT = String(process.env.PINATA_JWT || "").trim();
const PINATA_API_KEY = String(process.env.PINATA_API_KEY || "").trim();
const PINATA_API_SECRET = String(
  process.env.PINATA_API_SECRET || process.env.PINATA_SECRET_API_KEY || "",
).trim();
/** When true, uploads use only your Kubo node (127.0.0.1 or IPFS_API_*). Ignores Pinata env — use for local dev without Pinata. */
const IPFS_LOCAL_ONLY = /^1|true|yes$/i.test(String(process.env.IPFS_LOCAL_ONLY || "").trim());
const USE_PINATA_UPLOAD =
  !IPFS_LOCAL_ONLY && Boolean(PINATA_JWT || (PINATA_API_KEY && PINATA_API_SECRET));
const IPFS_GATEWAY_URL =
  process.env.IPFS_GATEWAY_URL ||
  (USE_PINATA_UPLOAD ? "https://gateway.pinata.cloud/ipfs" : "http://127.0.0.1:8081/ipfs");
const IPFS_GATEWAY_FALLBACK_URL = process.env.IPFS_GATEWAY_FALLBACK_URL || "https://ipfs.io/ipfs";
const PUSD_MINT = process.env.PUSD_MINT_ADDRESS || "6r8BmwjTEqYKciEuye1QWN8LqEp4sHhRUDjj2Y23t2aY";
const USDC_MINT = process.env.USDC_MINT_ADDRESS || "<USDC_MINT_ADDRESS>";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

let ipfsClient = null;
async function getLocalIpfs() {
  if (!ipfsClient) {
    const { create } = await import("ipfs-http-client");
    ipfsClient = create({
      host: IPFS_HOST,
      port: IPFS_PORT,
      protocol: IPFS_PROTOCOL,
    });
  }
  return ipfsClient;
}

let mongoConnectPromise = null;
let subscribersConnectPromise = null;
let subscribersConnection = null;

export async function ensureDbConnected() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  if (mongoose.connection.readyState === 1) return;
  if (!mongoConnectPromise) {
    mongoConnectPromise = mongoose.connect(uri).catch((err) => {
      mongoConnectPromise = null;
      throw err;
    });
  }
  await mongoConnectPromise;
}

export async function ensureSubscribersDbConnected() {
  const uri = String(process.env.SUBSCRIBERS_MONGODB_URI || "").trim();
  if (!uri) throw new Error("SUBSCRIBERS_MONGODB_URI is required");
  if (subscribersConnection?.readyState === 1) return subscribersConnection;
  if (!subscribersConnectPromise) {
    subscribersConnection = mongoose.createConnection(uri);
    subscribersConnectPromise = subscribersConnection.asPromise().catch((err) => {
      subscribersConnectPromise = null;
      subscribersConnection = null;
      throw err;
    });
  }
  await subscribersConnectPromise;
  return subscribersConnection;
}

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, index: true },
    description: { type: String, required: true },
    summary: { type: String, default: "" },
    price: { type: Number, default: 0 },
    priceSol: { type: Number, default: 0 },
    priceUsdc: { type: Number, default: 0 },
    priceUsdt: { type: Number, default: 0 },
    priceAudd: { type: Number, default: 0 },
    currency: { type: String, enum: ["PUSD", "SOL", "USDC"], default: "PUSD" },
    contentUrl: { type: String, default: "" },
    deliveryMode: { type: String, enum: ["direct", "ipfs_encrypted"], default: "direct" },
    ipfsCid: { type: String, default: "" },
    encryptedContentKey: { type: String, default: "" },
    encryptionAlgorithm: { type: String, default: "aes-256-gcm" },
    fileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    deliveryFiles: {
      type: [
        {
          ipfsCid: { type: String, default: "" },
          contentUrl: { type: String, default: "" },
          fileName: { type: String, default: "" },
          mimeType: { type: String, default: "" },
        },
      ],
      default: [],
    },
    coverUrl: { type: String, default: "" },
    thumbnailUrl: { type: String, default: "" },
    contentHash: { type: String, default: "" },
    productType: { type: String, default: "digital" },
    productInfo: { type: String, default: "" },
    status: { type: String, enum: ["draft", "published"], default: "published" },
    creatorWallet: { type: String, required: true, index: true },
    payoutWallet: { type: String, default: "" },
    salesCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const purchaseSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    buyerWallet: { type: String, required: true, index: true },
    txSignature: { type: String, required: true, unique: true },
    paymentMode: { type: String, enum: ["public", "private"], default: "public" },
    currency: { type: String, enum: ["PUSD", "SOL", "USDC"], default: "PUSD" },
    amount: { type: Number, required: true },
    amountSol: { type: Number, default: 0 },
    status: { type: String, default: "confirmed" },
  },
  { timestamps: true },
);

const Product = mongoose.models.Product || mongoose.model("Product", productSchema);
const Purchase = mongoose.models.Purchase || mongoose.model("Purchase", purchaseSchema);
const visitorEventSchema = new mongoose.Schema(
  {
    path: { type: String, required: true, index: true },
    referrer: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    country: { type: String, default: "" },
    ipHash: { type: String, default: "", index: true },
  },
  { timestamps: true },
);
const VisitorEvent =
  mongoose.models.VisitorEvent || mongoose.model("VisitorEvent", visitorEventSchema);
const subscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  },
  { timestamps: true },
);

function getSubscriberModel() {
  if (!subscribersConnection) {
    throw new Error("Subscribers database is not connected");
  }
  return subscribersConnection.models.Subscriber || subscribersConnection.model("Subscriber", subscriberSchema);
}

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const createUniqueSlug = async (title) => {
  const base = slugify(title) || "product";
  let slug = base;
  let counter = 1;
  while (await Product.exists({ slug })) {
    counter += 1;
    slug = `${base}-${counter}`;
  }
  return slug;
};

const buildIpfsUrls = (cid) => ({
  downloadUrl: `${IPFS_GATEWAY_URL}/${cid}`,
  backupUrl: `${IPFS_GATEWAY_FALLBACK_URL}/${cid}`,
});

/** Strip path segments from multipart names (files only; no folder paths). */
const uploadOriginalFileName = (originalname) => {
  const base = path.basename(String(originalname || "").trim() || "download.bin");
  if (!base || base === "." || base === "..") return "download.bin";
  return base.slice(0, 256);
};

const isLocalIpfsHost = () =>
  IPFS_HOST === "127.0.0.1" || IPFS_HOST === "localhost" || IPFS_HOST === "::1";

async function pinataJwtUpload(buffer, fileName, mimeType) {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
  formData.append("file", blob, fileName || "file.bin");
  formData.append("network", "public");
  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Pinata upload failed (${res.status}): ${text.slice(0, 400)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Pinata: invalid response`);
  }
  const cid = json.data?.cid ?? json.cid;
  if (!cid) throw new Error("Pinata: missing cid in response");
  return String(cid);
}

async function pinataLegacyUpload(buffer, fileName, mimeType) {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
  formData.append("file", blob, fileName || "file.bin");
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    },
    body: formData,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Pinata legacy upload failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const json = JSON.parse(text);
  const cid = json.IpfsHash;
  if (!cid) throw new Error("Pinata: missing IpfsHash in response");
  return String(cid);
}

/** Upload bytes to IPFS: Pinata (if configured and not IPFS_LOCAL_ONLY), else local Kubo API. */
async function addBufferToIpfs(buffer, fileName, mimeType) {
  if (USE_PINATA_UPLOAD) {
    if (PINATA_JWT) return pinataJwtUpload(buffer, fileName, mimeType);
    return pinataLegacyUpload(buffer, fileName, mimeType);
  }
  if (process.env.VERCEL && isLocalIpfsHost()) {
    const err = new Error("VERCEL_IPFS_NOT_CONFIGURED");
    err.code = "VERCEL_IPFS_NOT_CONFIGURED";
    throw err;
  }
  const result = await (await getLocalIpfs()).add(buffer);
  return result.cid.toString();
}

/** Same response shape as POST /digital-products/upload (after files are already on IPFS). */
function buildEncryptedDeliveryPayload(uploadedFiles) {
  const primary = uploadedFiles[0];
  const ipfsCid = primary.ipfsCid;
  const encryptedContentKey = crypto.randomBytes(48).toString("base64");
  const primaryUrls = buildIpfsUrls(ipfsCid);
  const deliveryFiles = uploadedFiles.map((f) => {
    const urls = buildIpfsUrls(f.ipfsCid);
    return {
      ipfsCid: f.ipfsCid,
      fileName: f.fileName,
      mimeType: f.mimeType,
      downloadUrl: urls.downloadUrl,
      backupUrl: urls.backupUrl,
    };
  });
  return {
    deliveryMode: "ipfs_encrypted",
    ipfsCid,
    downloadUrl: primaryUrls.downloadUrl,
    backupUrl: primaryUrls.backupUrl,
    encryptedContentKey,
    encryptionAlgorithm: "aes-256-gcm",
    fileName: primary.fileName,
    mimeType: primary.mimeType,
    files: deliveryFiles,
  };
}

function formatIpfsUploadFailure(error) {
  if (!error) {
    return "Failed to upload file to IPFS. On localhost: run Kubo (`ipfs daemon`, API :5001). Use IPFS_LOCAL_ONLY=1 in backend/.env to force Kubo and ignore Pinata. For large files without local IPFS, use Pinata + VITE_PINATA_JWT.";
  }
  if (error.code === "VERCEL_IPFS_NOT_CONFIGURED") return null;
  const msg = String(error.message || error || "").trim();
  const msgLower = msg.toLowerCase();
  const name = String(error.name || "");
  const cause = error.cause;
  const netCode = error.code || cause?.code;

  /** Node/undici often throws `TypeError: fetch failed` with ECONNREFUSED on `error.cause`. */
  const looksLikeFetchNetwork =
    netCode === "ECONNREFUSED" ||
    netCode === "ETIMEDOUT" ||
    netCode === "ENOTFOUND" ||
    netCode === "UND_ERR_CONNECT_TIMEOUT" ||
    msgLower.includes("fetch failed") ||
    msgLower.includes("failed to fetch") ||
    msgLower.includes("econnrefused");

  if (looksLikeFetchNetwork) {
    if (USE_PINATA_UPLOAD) {
      return `Could not reach Pinata or the network failed (${msg || netCode || "fetch failed"}). Check PINATA_JWT, firewall, and https://uploads.pinata.cloud availability.`;
    }
    const target = `${IPFS_PROTOCOL}://${IPFS_HOST}:${IPFS_PORT}`;
    return `Cannot reach your local IPFS (Kubo) API at ${target}. (${msg || netCode || "connection failed"}). Start Kubo: run \`ipfs daemon\` in a terminal and wait until the API is listening (default port 5001). Match IPFS_API_HOST / IPFS_API_PORT in backend/.env to your node. This is a connection issue, not file size — VITE_PINATA_JWT will not fix a Kubo node that is not running.`;
  }

  if (
    name === "RangeError" ||
    msg.includes("heap") ||
    msg.includes("allocation") ||
    msg.includes("Array buffer allocation") ||
    msg.includes("Cannot create a string longer than")
  ) {
    return "File is too large for the server to hold in RAM. Add VITE_PINATA_JWT to web/.env (same Pinata JWT as PINATA_JWT) so uploads go from your browser to Pinata instead of through localhost:4000.";
  }

  if (msg) {
    const head = msg.length > 520 ? `${msg.slice(0, 520)}…` : msg;
    if (process.env.VERCEL === "1") {
      return `${head} — If this persists for large files, set VITE_PINATA_JWT on the frontend.`;
    }
    if (IPFS_LOCAL_ONLY || !USE_PINATA_UPLOAD) {
      return `${head} — Using local Kubo: ensure \`ipfs daemon\` is running and ${IPFS_PROTOCOL}://${IPFS_HOST}:${IPFS_PORT} is reachable.`;
    }
    return `${head} — For very large uploads without buffering through this API, you can set VITE_PINATA_JWT in web/.env.`;
  }

  return "Failed to upload file to IPFS. Check backend logs. Local Kubo: IPFS_LOCAL_ONLY=1 and `ipfs daemon`. Hosted: Pinata + PINATA_JWT / VITE_PINATA_JWT.";
}

const registerIpfsFilesSchema = z.object({
  files: z
    .array(
      z.object({
        ipfsCid: z.string().min(4).max(120),
        fileName: z.string().max(256),
        mimeType: z.string().max(128).optional(),
      }),
    )
    .min(1)
    .max(10),
});

const deriveAtaAddress = (ownerAddress, mintAddress) => {
  const owner = new PublicKey(ownerAddress);
  const mint = new PublicKey(mintAddress);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata.toBase58();
};

const getExtension = (fileName = "") => {
  const cleaned = String(fileName || "").trim();
  if (!cleaned) return "";
  const lastDot = cleaned.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === cleaned.length - 1) return "";
  return cleaned.slice(lastDot);
};

const buildBuyerFileName = (product) => {
  const title = String(product?.title || "").trim();
  const extension = getExtension(product?.fileName || "");
  if (!title) {
    return product?.fileName || "download.bin";
  }
  return extension ? `${title}${extension}` : title;
};

const normalizeDeliveryFiles = (rawFiles) => {
  if (!Array.isArray(rawFiles)) return [];
  return rawFiles
    .map((f) => ({
      ipfsCid: String(f?.ipfsCid || "").trim(),
      contentUrl: String(f?.contentUrl || "").trim(),
      fileName: String(f?.fileName || "").trim(),
      mimeType: String(f?.mimeType || "").trim(),
    }))
    .filter((f) => f.fileName || f.ipfsCid || f.contentUrl);
};

const getDeliveryFilesForProduct = (product) => {
  const normalized = normalizeDeliveryFiles(product?.deliveryFiles);
  if (normalized.length > 0) return normalized;
  const mode = product?.deliveryMode || "direct";
  if (mode === "ipfs_encrypted" && String(product?.ipfsCid || "").trim()) {
    return [
      {
        ipfsCid: String(product.ipfsCid || "").trim(),
        contentUrl: "",
        fileName: String(product.fileName || "").trim(),
        mimeType: String(product.mimeType || "").trim(),
      },
    ];
  }
  if (String(product?.contentUrl || "").trim()) {
    return [
      {
        ipfsCid: "",
        contentUrl: String(product.contentUrl || "").trim(),
        fileName: String(product.fileName || "").trim(),
        mimeType: String(product.mimeType || "").trim(),
      },
    ];
  }
  return [];
};

const sanitizeAttachmentFileName = (name) => {
  const s = String(name || "download")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\0/g, "")
    .trim()
    .slice(0, 180);
  return s || "download";
};

/** RFC 5987 + ASCII fallback so browsers save as product title, not IPFS CID. */
const contentDispositionAttachment = (filename) => {
  const safe = sanitizeAttachmentFileName(filename);
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_");
  const star = encodeURIComponent(safe);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${star}`;
};

const fetchUpstreamForProduct = async (product) => {
  const mode = product.deliveryMode || "direct";
  if (mode === "ipfs_encrypted" && product.ipfsCid?.trim()) {
    const urls = [`${IPFS_GATEWAY_URL}/${product.ipfsCid}`, `${IPFS_GATEWAY_FALLBACK_URL}/${product.ipfsCid}`];
    for (const url of urls) {
      try {
        const upstream = await fetch(url, { redirect: "follow" });
        if (!upstream.ok || !upstream.body) continue;
        return upstream;
      } catch {
        continue;
      }
    }
    return null;
  }
  const contentUrl = String(product.contentUrl || "").trim();
  if (!/^https?:\/\//i.test(contentUrl)) return null;
  try {
    const upstream = await fetch(contentUrl, { redirect: "follow" });
    if (!upstream.ok || !upstream.body) return null;
    return upstream;
  } catch {
    return null;
  }
};

const createProductSchema = z
  .object({
    title: z.string().min(2),
    description: z.string().min(5),
    summary: z.string().max(2000).optional(),
    price: z.number().min(0).optional(),
    priceSol: z.number().min(0),
    priceUsdc: z.number().min(0),
    currency: z.enum(["PUSD", "SOL", "USDC"]).optional(),
    contentUrl: z.string().url().optional(),
    deliveryMode: z.enum(["direct", "ipfs_encrypted"]).optional(),
    ipfsCid: z.string().max(120).optional(),
    encryptedContentKey: z.string().max(4096).optional(),
    encryptionAlgorithm: z.string().max(64).optional(),
    fileName: z.string().max(256).optional(),
    mimeType: z.string().max(128).optional(),
    deliveryFiles: z
      .array(
        z.object({
          ipfsCid: z.string().max(120).optional(),
          contentUrl: z.string().url().optional(),
          fileName: z.string().max(256).optional(),
          mimeType: z.string().max(128).optional(),
        }),
      )
      .max(10)
      .optional(),
    coverUrl: z.string().max(12_000_000).optional(),
    thumbnailUrl: z.string().max(12_000_000).optional(),
    contentHash: z.string().max(128).optional(),
    productType: z.string().max(64).optional(),
    productInfo: z.string().max(4000).optional(),
    status: z.enum(["draft", "published"]).optional(),
    creatorWallet: z.string().min(32),
    payoutWallet: z.string().min(32).optional(),
  })
  .refine(
    (d) => {
      const c = d.currency ?? "PUSD";
      if (c === "PUSD") return (d.price ?? 0) > 0;
      if (c === "USDC") return d.priceUsdc > 0;
      return d.priceSol > 0;
    },
    { message: "Price must be positive for the selected currency" },
  )
  .refine(
    (d) => {
      const mode = d.deliveryMode ?? "direct";
      if (mode === "ipfs_encrypted") {
        const hasFiles = Array.isArray(d.deliveryFiles) && d.deliveryFiles.length > 0;
        return (hasFiles || Boolean(d.ipfsCid?.trim())) && Boolean(d.encryptedContentKey?.trim());
      }
      return Boolean(d.contentUrl?.trim());
    },
    { message: "Delivery payload is invalid for the selected delivery mode" },
  );

const updateProductSchema = z
  .object({
    title: z.string().min(2).optional(),
    description: z.string().min(5).optional(),
    summary: z.string().max(2000).optional(),
    price: z.number().min(0).optional(),
    priceSol: z.number().min(0).optional(),
    priceUsdc: z.number().min(0).optional(),
    currency: z.enum(["PUSD", "SOL", "USDC"]).optional(),
    contentUrl: z.string().url().optional(),
    deliveryMode: z.enum(["direct", "ipfs_encrypted"]).optional(),
    ipfsCid: z.string().max(120).optional(),
    encryptedContentKey: z.string().max(4096).optional(),
    encryptionAlgorithm: z.string().max(64).optional(),
    fileName: z.string().max(256).optional(),
    mimeType: z.string().max(128).optional(),
    deliveryFiles: z
      .array(
        z.object({
          ipfsCid: z.string().max(120).optional(),
          contentUrl: z.string().url().optional(),
          fileName: z.string().max(256).optional(),
          mimeType: z.string().max(128).optional(),
        }),
      )
      .max(10)
      .optional(),
    coverUrl: z.string().max(12_000_000).optional(),
    thumbnailUrl: z.string().max(12_000_000).optional(),
    contentHash: z.string().max(128).optional(),
    productType: z.string().max(64).optional(),
    productInfo: z.string().max(4000).optional(),
    status: z.enum(["draft", "published"]).optional(),
    creatorWallet: z.string().min(32),
    payoutWallet: z.string().min(32).optional(),
  })
  .refine(
    (d) => {
      const c = d.currency ?? "PUSD";
      if (c === "PUSD") return (d.price ?? 0) > 0;
      if (c === "USDC") return (d.priceUsdc ?? 0) > 0;
      return (d.priceSol ?? 0) > 0;
    },
    { message: "Price must be positive for the selected currency" },
  )
  .refine(
    (d) => {
      const mode = d.deliveryMode ?? "direct";
      if (mode === "ipfs_encrypted") {
        const hasFiles = Array.isArray(d.deliveryFiles) && d.deliveryFiles.length > 0;
        return (hasFiles || Boolean(d.ipfsCid?.trim())) && Boolean(d.encryptedContentKey?.trim());
      }
      return Boolean(d.contentUrl?.trim());
    },
    { message: "Delivery payload is invalid for the selected delivery mode" },
  );

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const allowedOrigins = parseCorsOrigins();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 10,
  },
});

function corsOptions(origin, callback) {
  if (!origin) return callback(null, true);
  if (!allowedOrigins.length) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error("CORS blocked for this origin"));
}

export function createApp() {
  const app = express();
  app.use(cors({ origin: corsOptions }));
  app.use(express.json({ limit: "15mb" }));

  // Health must not sit behind ensureDbConnected — missing MONGODB_URI would block all routes
  // and make Vercel look like a broken deployment (FUNCTION_INVOCATION_FAILED / timeouts).
  app.get("/api/health", async (_req, res) => {
    const body = { ok: true, mongoConfigured: Boolean(String(process.env.MONGODB_URI || "").trim()) };
    if (USE_PINATA_UPLOAD) {
      body.uploads = "pinata";
    } else {
      body.uploads = "kubo";
      body.kuboApi = `${IPFS_PROTOCOL}://${IPFS_HOST}:${IPFS_PORT}`;
      try {
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), 2000);
        const resp = await fetch(`${IPFS_PROTOCOL}://${IPFS_HOST}:${IPFS_PORT}/api/v0/version`, {
          method: "POST",
          signal: ac.signal,
        });
        clearTimeout(to);
        body.kuboReachable = resp.ok;
        if (!resp.ok) body.kuboError = `HTTP ${resp.status}`;
      } catch (e) {
        body.kuboReachable = false;
        const code = e?.cause?.code || e?.code;
        body.kuboError = code || e?.name || String(e.message || e).slice(0, 160);
        body.kuboHint =
          "Product uploads need Kubo running: `ipfs daemon` (API default :5001). Or use Pinata: set PINATA_JWT, remove IPFS_LOCAL_ONLY from backend/.env, optionally VITE_PINATA_JWT in web/.env.";
      }
    }
    body.subscribersMongoConfigured = Boolean(String(process.env.SUBSCRIBERS_MONGODB_URI || "").trim());
    res.json(body);
  });

  // Footer email signup — separate MongoDB (`subs-rivo`), not the main app database
  app.post("/api/subscribers", async (req, res) => {
    try {
      await ensureSubscribersDbConnected();
      const Subscriber = getSubscriberModel();

      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Valid email is required." });
      }

      const existing = await Subscriber.findOne({ email });
      if (existing) {
        return res.json({ success: true, message: "You're already subscribed." });
      }

      await Subscriber.create({ email });
      return res.status(201).json({ success: true, message: "Thanks for subscribing!" });
    } catch (e) {
      if (e?.message?.includes("SUBSCRIBERS_MONGODB_URI")) {
        console.error(e);
        return res.status(503).json({ message: "Newsletter signup is not configured." });
      }
      if (e?.code === 11000) {
        return res.json({ success: true, message: "You're already subscribed." });
      }
      console.error(e);
      return res.status(500).json({ message: "Could not subscribe. Try again." });
    }
  });

  app.use(async (_req, _res, next) => {
    try {
      await ensureDbConnected();
      next();
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/analytics/track", async (req, res) => {
    try {
      const path = String(req.body?.path || "").trim();
      if (!path || !path.startsWith("/")) {
        return res.status(400).json({ message: "path must be an absolute route path" });
      }

      const referrer = String(req.body?.referrer || "").slice(0, 1000);
      const userAgent = String(req.headers["user-agent"] || "").slice(0, 1000);
      const country = String(req.headers["x-vercel-ip-country"] || "").slice(0, 16);
      const ip =
        String(req.headers["x-forwarded-for"] || "")
          .split(",")[0]
          .trim() || String(req.socket?.remoteAddress || "");
      const ipHash = ip
        ? crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24)
        : "";

      await VisitorEvent.create({
        path: path.slice(0, 500),
        referrer,
        userAgent,
        country,
        ipHash,
      });

      return res.status(201).json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to track analytics event" });
    }
  });

  app.get("/api/analytics/dashboard", async (_req, res) => {
    try {
      const now = Date.now();
      const last24h = new Date(now - 24 * 60 * 60 * 1000);
      const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const last30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

      const [events24h, events7d, events30d, totalsByPath, topCountries, recentEvents] =
        await Promise.all([
          VisitorEvent.countDocuments({ createdAt: { $gte: last24h } }),
          VisitorEvent.countDocuments({ createdAt: { $gte: last7d } }),
          VisitorEvent.countDocuments({ createdAt: { $gte: last30d } }),
          VisitorEvent.aggregate([
            { $match: { createdAt: { $gte: last30d } } },
            { $group: { _id: "$path", views: { $sum: 1 } } },
            { $sort: { views: -1 } },
            { $limit: 12 },
          ]),
          VisitorEvent.aggregate([
            { $match: { createdAt: { $gte: last30d } } },
            { $group: { _id: "$country", views: { $sum: 1 } } },
            { $sort: { views: -1 } },
            { $limit: 8 },
          ]),
          VisitorEvent.find({}, { path: 1, country: 1, referrer: 1, createdAt: 1 })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean(),
        ]);

      return res.json({
        window: "30d",
        visitors: {
          events24h,
          events7d,
          events30d,
        },
        topPages: totalsByPath.map((item) => ({
          path: item._id || "(unknown)",
          views: item.views || 0,
        })),
        topCountries: topCountries
          .filter((item) => item._id)
          .map((item) => ({
            country: item._id,
            views: item.views || 0,
          })),
        recent: recentEvents.map((item) => ({
          path: item.path,
          country: item.country || "N/A",
          referrer: item.referrer || "Direct",
          createdAt: item.createdAt,
        })),
      });
    } catch {
      return res.status(500).json({ message: "Failed to load analytics dashboard" });
    }
  });

  app.get("/api/admin/leaderboard", async (req, res) => {
    try {
      const adminWallet = req.query.wallet;
      if (adminWallet !== "6jaM7rGsMgk81pogFqMAGj7K8AByW8tQTTEnmDYFQpbH") {
        return res.status(403).json({ message: "Forbidden: Not admin" });
      }

      const HIDDEN_TITLES = new Set(
        [
          "pinte",
          "test0",
          "hero1",
          "faizer",
          "oops project",
          "test5",
          "test3",
          "test1",
          "1000xdev",
          "1000x",
          "popchian",
          "popchain",
          "orion",
          "jaggachain",
          "carflix",
          "sadc",
        ].map((t) => t.trim().toLowerCase()),
      );

      const isListedProduct = (product) => {
        if (!product) return false;
        if (product.status === "draft") return false;
        const title = String(product.title ?? "").trim().toLowerCase();
        if (!title || HIDDEN_TITLES.has(title)) return false;
        return true;
      };

      const byProduct = await Purchase.aggregate([
        { $match: { status: "confirmed" } },
        {
          $group: {
            _id: "$productId",
            totalRevenueUsd: {
              $sum: {
                $cond: [{ $in: ["$currency", ["PUSD", "USDC"]] }, "$amount", 0],
              },
            },
            totalRevenueSol: {
              $sum: {
                $cond: [{ $eq: ["$currency", "SOL"] }, "$amountSol", 0],
              },
            },
            buyersCount: { $sum: 1 },
          },
        },
        { $sort: { buyersCount: -1 } },
      ]);

      const populated = await Product.populate(byProduct, {
        path: "_id",
        select: "title price priceSol coverUrl status",
      });

      const formatted = populated
        .filter((item) => isListedProduct(item._id))
        .map((item) => ({
          product: item._id,
          totalRevenueUsd: item.totalRevenueUsd || 0,
          totalRevenueSol: item.totalRevenueSol || 0,
          buyersCount: item.buyersCount || 0,
        }));

      const sumGrossUsd = formatted.reduce((acc, row) => acc + row.totalRevenueUsd, 0);
      const sumGrossSol = formatted.reduce((acc, row) => acc + row.totalRevenueSol, 0);
      const totalPlatformRevenueUsd = sumGrossUsd * 0.01;
      const totalPlatformRevenueSol = sumGrossSol * 0.01;
      const totalPurchases = formatted.reduce((acc, row) => acc + row.buyersCount, 0);

      const platformRevenueUsdByProduct = formatted
        .filter((row) => row.totalRevenueUsd > 0)
        .map((row) => ({
          productId: String(row.product._id),
          productTitle: row.product.title,
          buyersCount: row.buyersCount,
          gross: row.totalRevenueUsd,
          platformFee: row.totalRevenueUsd * 0.01,
        }))
        .sort((a, b) => b.platformFee - a.platformFee);

      const platformRevenueSolByProduct = formatted
        .filter((row) => row.totalRevenueSol > 0)
        .map((row) => ({
          productId: String(row.product._id),
          productTitle: row.product.title,
          buyersCount: row.buyersCount,
          gross: row.totalRevenueSol,
          platformFee: row.totalRevenueSol * 0.01,
        }))
        .sort((a, b) => b.platformFee - a.platformFee);

      const recentPurchases = await Purchase.find({ status: "confirmed" })
        .populate("productId", "title status")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

      const mapPurchaseRow = (p) => {
        const product = p.productId;
        if (!isListedProduct(product)) return null;
        const isSol = p.currency === "SOL";
        const gross = isSol ? p.amountSol || 0 : p.amount || 0;
        if (gross <= 0) return null;
        return {
          buyerWallet: p.buyerWallet,
          productTitle: product.title,
          currency: p.currency,
          gross,
          platformFee: gross * 0.01,
          createdAt: p.createdAt,
        };
      };

      const recentUsdPurchases = recentPurchases
        .filter((p) => p.currency === "PUSD" || p.currency === "USDC")
        .map(mapPurchaseRow)
        .filter(Boolean);
      const recentSolPurchases = recentPurchases
        .filter((p) => p.currency === "SOL")
        .map(mapPurchaseRow)
        .filter(Boolean);

      return res.json({
        totalPlatformRevenueUsd,
        totalPlatformRevenueSol,
        totalProductSalesUsd: sumGrossUsd,
        totalProductSalesSol: sumGrossSol,
        totalRivoSalesUsd: totalPlatformRevenueUsd,
        totalRivoSalesSol: totalPlatformRevenueSol,
        totalPurchases,
        topProducts: formatted.slice(0, 10),
        platformRevenueUsdByProduct,
        platformRevenueSolByProduct,
        recentUsdPurchases,
        recentSolPurchases,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "Failed to load admin leaderboard" });
    }
  });

  app.get("/api/tokens", (_req, res) => {
    return res.json({
      PUSD: { symbol: "PUSD", mint: PUSD_MINT, decimals: 6, isDefault: true },
      USDC: { symbol: "USDC", mint: USDC_MINT, decimals: 6 },
      SOL: { symbol: "SOL", type: "native" },
    });
  });

  app.get("/api/products", async (_req, res) => {
    try {
      res.json(await Product.find({ status: "published" }).sort({ createdAt: -1 }));
    } catch {
      res.status(500).json({ message: "Failed to list products" });
    }
  });

  app.get("/api/products/creator/:wallet", async (req, res) => {
    try {
      res.json(await Product.find({ creatorWallet: req.params.wallet }).sort({ createdAt: -1 }));
    } catch {
      res.status(500).json({ message: "Failed to load creator products" });
    }
  });

  app.get("/api/creators/:wallet/payout", async (req, res) => {
    try {
      const { wallet } = req.params;
      const product = await Product.findOne({ creatorWallet: wallet }).sort({ createdAt: -1 });
      const payoutWallet = product?.payoutWallet || wallet;
      res.json({ payoutWallet });
    } catch {
      res.status(500).json({ message: "Failed to load payout settings" });
    }
  });

  app.get("/api/products/slug/:slug", async (req, res) => {
    try {
      const p = await Product.findOne({ slug: req.params.slug, status: "published" });
      if (!p) return res.status(404).json({ message: "Not found" });
      return res.json(p);
    } catch {
      return res.status(400).json({ message: "Invalid slug" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const p = await Product.findOne({ _id: req.params.id, status: "published" });
      if (!p) return res.status(404).json({ message: "Not found" });
      return res.json(p);
    } catch {
      return res.status(400).json({ message: "Invalid product id" });
    }
  });

  app.get("/api/products/:id/owner/:wallet", async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ message: "Not found" });
      if (product.creatorWallet !== req.params.wallet) {
        return res.status(403).json({ message: "Forbidden" });
      }
      return res.json(product);
    } catch {
      return res.status(400).json({ message: "Invalid product id" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const parsed = createProductSchema.parse(req.body);
      const slug = await createUniqueSlug(parsed.title);
      const product = await Product.create({
        ...parsed,
        slug,
        currency: parsed.currency ?? "PUSD",
        price: parsed.price ?? 0,
        contentHash: parsed.contentHash ?? "",
        deliveryMode: parsed.deliveryMode ?? "direct",
        ipfsCid: parsed.ipfsCid ?? "",
        encryptedContentKey: parsed.encryptedContentKey ?? "",
        encryptionAlgorithm: parsed.encryptionAlgorithm ?? "aes-256-gcm",
        fileName: parsed.fileName ?? "",
        mimeType: parsed.mimeType ?? "",
        deliveryFiles: normalizeDeliveryFiles(parsed.deliveryFiles),
        summary: parsed.summary ?? "",
        coverUrl: parsed.coverUrl ?? "",
        thumbnailUrl: parsed.thumbnailUrl ?? "",
        productType: parsed.productType ?? "digital",
        productInfo: parsed.productInfo ?? "",
        status: parsed.status ?? "draft",
        payoutWallet: parsed.payoutWallet ?? parsed.creatorWallet,
      });
      res.status(201).json(product);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ message: "Invalid payload", issues: e.issues });
      return res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.post("/api/products/:id/publish", async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ message: "Not found" });
      if (!product.slug) product.slug = await createUniqueSlug(product.title);
      product.status = "published";
      await product.save();
      return res.json(product);
    } catch {
      return res.status(400).json({ message: "Invalid product id" });
    }
  });

  app.put("/api/products/:id", async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ message: "Not found" });

      if (!req.body?.creatorWallet || req.body.creatorWallet !== product.creatorWallet) {
        return res.status(403).json({ message: "Only product owner can edit this product" });
      }

      const merged = {
        title: req.body.title ?? product.title,
        description: req.body.description ?? product.description,
        summary: req.body.summary ?? product.summary ?? "",
        price: req.body.price ?? product.price ?? 0,
        priceSol: req.body.priceSol ?? product.priceSol,
        priceUsdc: req.body.priceUsdc ?? product.priceUsdc,
        currency: req.body.currency ?? product.currency ?? "PUSD",
        contentUrl: req.body.contentUrl ?? product.contentUrl,
        deliveryMode: req.body.deliveryMode ?? product.deliveryMode ?? "direct",
        ipfsCid: req.body.ipfsCid ?? product.ipfsCid ?? "",
        encryptedContentKey: req.body.encryptedContentKey ?? product.encryptedContentKey ?? "",
        encryptionAlgorithm: req.body.encryptionAlgorithm ?? product.encryptionAlgorithm ?? "aes-256-gcm",
        fileName: req.body.fileName ?? product.fileName ?? "",
        mimeType: req.body.mimeType ?? product.mimeType ?? "",
        deliveryFiles: req.body.deliveryFiles ?? product.deliveryFiles ?? [],
        coverUrl: req.body.coverUrl ?? product.coverUrl ?? "",
        thumbnailUrl: req.body.thumbnailUrl ?? product.thumbnailUrl ?? "",
        contentHash: req.body.contentHash ?? product.contentHash ?? "",
        productType: req.body.productType ?? product.productType ?? "digital",
        productInfo: req.body.productInfo ?? product.productInfo ?? "",
        status: req.body.status ?? product.status ?? "draft",
        creatorWallet: req.body.creatorWallet,
        payoutWallet:
          (req.body.payoutWallet ?? product.payoutWallet) ||
          product.creatorWallet,
      };

      const parsed = updateProductSchema.parse(merged);

      if (parsed.title !== product.title) {
        product.slug = await createUniqueSlug(parsed.title);
      }

      product.title = parsed.title;
      product.description = parsed.description;
      product.summary = parsed.summary ?? "";
      product.price = parsed.price ?? 0;
      product.priceSol = parsed.priceSol ?? 0;
      product.priceUsdc = parsed.priceUsdc ?? 0;
      product.priceUsdt = 0;
      product.priceAudd = 0;
      product.currency = parsed.currency ?? "PUSD";
      product.contentUrl = parsed.contentUrl ?? product.contentUrl;
      product.deliveryMode = parsed.deliveryMode ?? "direct";
      product.ipfsCid = parsed.ipfsCid ?? "";
      product.encryptedContentKey = parsed.encryptedContentKey ?? "";
      product.encryptionAlgorithm = parsed.encryptionAlgorithm ?? "aes-256-gcm";
      product.fileName = parsed.fileName ?? "";
      product.mimeType = parsed.mimeType ?? "";
      product.deliveryFiles = normalizeDeliveryFiles(parsed.deliveryFiles);
      product.coverUrl = parsed.coverUrl ?? "";
      product.thumbnailUrl = parsed.thumbnailUrl ?? parsed.coverUrl ?? "";
      product.contentHash = parsed.contentHash ?? "";
      product.productType = parsed.productType ?? "digital";
      product.productInfo = parsed.productInfo ?? "";
      product.status = parsed.status ?? product.status;
      product.payoutWallet =
        parsed.payoutWallet ||
        product.payoutWallet ||
        product.creatorWallet;

      await product.save();
      return res.json(product);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ message: "Invalid payload", issues: e.issues });
      return res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ message: "Not found" });
      const creatorWallet = req.query.creatorWallet || req.body?.creatorWallet;
      if (!creatorWallet || creatorWallet !== product.creatorWallet) {
        return res.status(403).json({ message: "Only the product owner can delete this product" });
      }
      await product.deleteOne();
      return res.json({ ok: true });
    } catch {
      return res.status(400).json({ message: "Invalid product id" });
    }
  });

  app.post("/api/purchases/verify", async (req, res) => {
    const { productId, buyerWallet, txSignature, currency, paymentMode } = req.body;
    if (!productId || !buyerWallet || !txSignature) {
      return res.status(400).json({ message: "productId, buyerWallet, and txSignature are required" });
    }
    if (paymentMode === "private") {
      return res.status(400).json({
        message: "Private checkout is no longer supported. Use the standard wallet payment flow.",
      });
    }
    const checkoutMode = "public";

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const checkoutCurrency = currency || product.currency || "PUSD";
    if (checkoutCurrency === "PUSD" && (!product.price || product.price <= 0)) {
      return res.status(400).json({ message: "This product has no PUSD price" });
    }
    if (checkoutCurrency === "SOL" && product.priceSol <= 0) {
      return res.status(400).json({ message: "This product has no SOL price" });
    }
    if (checkoutCurrency === "USDC" && (product.priceUsdc ?? 0) <= 0) {
      return res.status(400).json({ message: "This product has no USDC price" });
    }
    if (checkoutCurrency === "USDT" || checkoutCurrency === "AUDD") {
      return res.status(400).json({ message: "This currency is no longer supported" });
    }

    // Convert SOL -> lamports deterministically (client uses the same 9-decimal approach).
    const solFixed = product.priceSol.toFixed(9);
    const [wholePart, fracPart = ""] = solFixed.split(".");
    const expectedLamports = BigInt(wholePart) * BigInt(LAMPORTS_PER_SOL) + BigInt(fracPart.padEnd(9, "0").slice(0, 9));
    const feeLamports = expectedLamports / 100n; // 1% platform fee
    const creatorLamports = expectedLamports - feeLamports;
    const payoutWallet = product.payoutWallet || product.creatorWallet;

    const existing = await Purchase.findOne({ txSignature });
    if (existing) {
      if (existing.buyerWallet !== buyerWallet) return res.status(400).json({ message: "Signature already used" });
      if (existing.productId.toString() !== String(productId)) {
        return res.status(400).json({ message: "Signature already used for another product" });
      }
      return res.json({ ok: true, idempotent: true });
    }

    let check;
    if (checkoutCurrency === "PUSD") {
      if (!product.price || product.price <= 0) {
        return res.status(400).json({ message: "This product has no PUSD price" });
      }
      if (PUSD_MINT.startsWith("<")) {
        return res.status(500).json({ message: "PUSD mint is not configured on backend" });
      }
      const expectedTotal = BigInt(Math.round(product.price));
      const expectedFee = expectedTotal / 100n; // 1% platform fee
      const expectedCreator = expectedTotal - expectedFee;

      const buyerAta = deriveAtaAddress(buyerWallet, PUSD_MINT);
      const creatorAta = deriveAtaAddress(payoutWallet, PUSD_MINT);
      const platformAta = deriveAtaAddress(RIPPLE_FEE_WALLET, PUSD_MINT);

      check = await verifySplSplitTransfer(
        connection,
        txSignature,
        PUSD_MINT,
        buyerAta,
        creatorAta,
        expectedCreator.toString(),
        platformAta,
        expectedFee.toString(),
      );
      if (!check.ok) return res.status(400).json({ message: check.reason || "PUSD verification failed" });
    } else if (checkoutCurrency === "USDC") {
      const mint = USDC_MINT;
      const human = product.priceUsdc ?? 0;
      if (human <= 0) {
        return res.status(400).json({ message: `This product has no ${checkoutCurrency} price` });
      }
      if (mint.startsWith("<")) {
        return res.status(500).json({ message: `${checkoutCurrency} mint is not configured on backend` });
      }
      const expectedTotal = BigInt(Math.round(human * 1_000_000));
      const expectedFee = expectedTotal / 100n;
      const expectedCreator = expectedTotal - expectedFee;
      const buyerAta = deriveAtaAddress(buyerWallet, mint);
      const creatorAta = deriveAtaAddress(payoutWallet, mint);
      const platformAta = deriveAtaAddress(RIPPLE_FEE_WALLET, mint);
      check = await verifySplSplitTransfer(
        connection,
        txSignature,
        mint,
        buyerAta,
        creatorAta,
        expectedCreator.toString(),
        platformAta,
        expectedFee.toString(),
      );
      if (!check.ok) {
        return res.status(400).json({ message: check.reason || `${checkoutCurrency} verification failed` });
      }
    } else {
      check = await verifySolTransfer(
        connection,
        txSignature,
        buyerWallet,
        payoutWallet,
        RIPPLE_FEE_WALLET,
        creatorLamports.toString(),
        feeLamports.toString(),
      );
      if (!check.ok) return res.status(400).json({ message: check.reason || "Verification failed" });
    }

    try {
      await Purchase.create({
        productId,
        buyerWallet,
        txSignature,
        paymentMode: checkoutMode,
        currency: checkoutCurrency,
        amount:
          checkoutCurrency === "PUSD"
            ? product.price
            : checkoutCurrency === "USDC"
              ? product.priceUsdc
              : product.priceSol,
        amountSol: checkoutCurrency === "SOL" ? product.priceSol : 0,
        status: "confirmed",
      });
    } catch (e) {
      if (e?.code === 11000) return res.status(400).json({ message: "Duplicate transaction" });
      throw e;
    }

    product.salesCount += 1;
    await product.save();
    return res.json({ ok: true, paymentMode: checkoutMode });
  });

  app.post("/api/digital-products/upload", upload.array("files", 10), async (req, res) => {
    const files = req.files || [];
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ message: "A file is required." });
    }
    try {
      const uploadedFiles = [];
      for (const file of files) {
        const safeName = uploadOriginalFileName(file.originalname);
        const ipfsCid = await addBufferToIpfs(
          file.buffer,
          safeName,
          file.mimetype || "application/octet-stream",
        );
        uploadedFiles.push({
          ipfsCid,
          fileName: safeName,
          mimeType: file.mimetype || "application/octet-stream",
        });
      }
      return res.json(buildEncryptedDeliveryPayload(uploadedFiles));
    } catch (error) {
      console.error("IPFS upload failed", error);
      if (error?.code === "VERCEL_IPFS_NOT_CONFIGURED") {
        return res.status(503).json({
          message:
            "File upload is not configured for this host. In Vercel project settings add PINATA_JWT (Pinata → API Keys → JWT), or set IPFS_API_HOST to a reachable IPFS HTTP API. Optionally set IPFS_GATEWAY_URL to your Pinata gateway.",
        });
      }
      const message = formatIpfsUploadFailure(error) || "Failed to upload file to IPFS.";
      return res.status(500).json({ message });
    }
  });

  /**
   * Register CIDs after browser-direct Pinata upload (bypasses Vercel body size limits).
   * Requires files already pinned (e.g. via VITE_PINATA_JWT on the client).
   */
  app.post("/api/digital-products/register-ipfs", async (req, res) => {
    try {
      const parsed = registerIpfsFilesSchema.parse(req.body);
      const uploadedFiles = parsed.files.map((f) => ({
        ipfsCid: f.ipfsCid.trim(),
        fileName: uploadOriginalFileName(f.fileName),
        mimeType: String(f.mimeType || "application/octet-stream").slice(0, 128) || "application/octet-stream",
      }));
      return res.json(buildEncryptedDeliveryPayload(uploadedFiles));
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid payload", issues: e.issues });
      }
      console.error("register-ipfs", e);
      return res.status(500).json({ message: "Failed to register upload." });
    }
  });

  app.post("/api/access/unlock", async (req, res) => {
    const { productId, buyerWallet } = req.body;
    if (!productId || !buyerWallet) return res.status(400).json({ message: "productId and buyerWallet required" });
    const record = await Purchase.findOne({ productId, buyerWallet, status: "confirmed" });
    if (!record) return res.status(403).json({ message: "No access" });
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if ((product.deliveryMode || "direct") === "ipfs_encrypted") {
      const files = getDeliveryFilesForProduct(product).map((file) => {
        const urls = buildIpfsUrls(file.ipfsCid || "");
        return {
          ipfsCid: file.ipfsCid || "",
          downloadUrl: urls.downloadUrl,
          backupUrl: urls.backupUrl,
          fileName: file.fileName || buildBuyerFileName(product),
          mimeType: file.mimeType || "application/octet-stream",
        };
      });
      const first = files[0] || null;
      return res.json({
        mode: "ipfs_encrypted",
        ipfsCid: first?.ipfsCid || product.ipfsCid || "",
        downloadUrl: first?.downloadUrl || "",
        backupUrl: first?.backupUrl || "",
        encryptedContentKey: product.encryptedContentKey || "",
        encryptionAlgorithm: product.encryptionAlgorithm || "aes-256-gcm",
        fileName: first?.fileName || buildBuyerFileName(product),
        mimeType: first?.mimeType || "application/octet-stream",
        files,
      });
    }
    return res.json({
      mode: "direct",
      contentUrl: product.contentUrl || "",
      fileName: buildBuyerFileName(product),
      mimeType: product.mimeType || "application/octet-stream",
    });
  });

  /**
   * Streams the file with Content-Disposition so the saved name matches the product title.
   * Browsers ignore <a download> for cross-origin IPFS URLs and use the CID instead.
   * Registered at /api/... (normal) and /access/... (VITE_API_URL without /api, some proxies, Vercel path quirks).
   */
  const servePurchasedDownload = async (req, res) => {
    const fileIndexRaw = Number(req.query.fileIndex ?? "0");
    const fileIndex = Number.isFinite(fileIndexRaw) ? Math.max(0, Math.floor(fileIndexRaw)) : 0;
    const productId = String(req.query.productId || "");
    const buyerWallet = String(req.query.buyerWallet || "");
    if (!productId || !buyerWallet) {
      return res.status(400).json({ message: "productId and buyerWallet are required" });
    }
    const record = await Purchase.findOne({ productId, buyerWallet, status: "confirmed" });
    if (!record) return res.status(403).json({ message: "No access" });
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const productFiles = getDeliveryFilesForProduct(product);
    const selectedFile = productFiles[fileIndex] || productFiles[0] || null;
    const attachmentName = selectedFile?.fileName || buildBuyerFileName(product);
    const disposition = contentDispositionAttachment(attachmentName);
    const fallbackMime = selectedFile?.mimeType || product.mimeType || "application/octet-stream";

    try {
      const mode = product.deliveryMode || "direct";
      const fileToFetch =
        selectedFile ||
        (mode === "ipfs_encrypted"
          ? { ipfsCid: product.ipfsCid || "", contentUrl: "", fileName: "", mimeType: product.mimeType || "" }
          : { ipfsCid: "", contentUrl: product.contentUrl || "", fileName: "", mimeType: product.mimeType || "" });
      const upstream = await fetchUpstreamForProduct({
        ...product.toObject(),
        ipfsCid: fileToFetch.ipfsCid || "",
        contentUrl: fileToFetch.contentUrl || "",
      });
      if (!upstream) {
        return res.status(502).json({ message: "Could not fetch file for download" });
      }
      const ct = upstream.headers.get("content-type") || fallbackMime;
      res.setHeader("Content-Type", ct);
      res.setHeader("Content-Disposition", disposition);
      const cl = upstream.headers.get("content-length");
      if (cl) res.setHeader("Content-Length", cl);
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (e) {
      console.error("download-file", e);
      if (!res.headersSent) {
        return res.status(502).json({ message: "Download failed" });
      }
      res.destroy(e);
    }
  };

  app.get("/api/access/download-file", servePurchasedDownload);
  app.get("/access/download-file", servePurchasedDownload);

  app.get("/api/download/:productId", async (req, res) => {
    const { productId } = req.params;
    const buyerWallet = String(req.query.buyerWallet || "");
    if (!buyerWallet) {
      return res.status(400).json({ message: "buyerWallet query param is required" });
    }
    const record = await Purchase.findOne({ productId, buyerWallet, status: "confirmed" });
    if (!record) return res.status(403).json({ message: "No access" });
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if ((product.deliveryMode || "direct") !== "ipfs_encrypted" || !product.ipfsCid) {
      return res.status(400).json({ message: "Product does not use IPFS delivery" });
    }
    const { downloadUrl, backupUrl } = buildIpfsUrls(product.ipfsCid);
    return res.json({
      downloadUrl,
      backupUrl,
      cid: product.ipfsCid,
      fileName: buildBuyerFileName(product),
    });
  });

  app.get("/api/purchases/wallet/:wallet", async (req, res) => {
    try {
      const items = await Purchase.find({ buyerWallet: req.params.wallet }).populate("productId").sort({ createdAt: -1 });
      res.json(items);
    } catch {
      res.status(500).json({ message: "Failed to load purchases" });
    }
  });

  app.get("/api/purchases/creator/:wallet", async (req, res) => {
    try {
      const products = await Product.find({ creatorWallet: req.params.wallet });
      const ids = products.map((p) => p._id);
      const items = await Purchase.find({ productId: { $in: ids } }).populate("productId").sort({ createdAt: -1 });
      res.json(items);
    } catch {
      res.status(500).json({ message: "Failed to load creator sales" });
    }
  });

  app.post("/api/creators/:wallet/payout", async (req, res) => {
    const { wallet } = req.params;
    const { payoutWallet } = req.body ?? {};
    if (!payoutWallet || typeof payoutWallet !== "string" || payoutWallet.length < 32) {
      return res.status(400).json({ message: "payoutWallet is required" });
    }
    try {
      const result = await Product.updateMany({ creatorWallet: wallet }, { payoutWallet });
      return res.json({ ok: true, updated: result?.modifiedCount ?? 0 });
    } catch {
      return res.status(500).json({ message: "Failed to update payout wallet" });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found" });
  });

  app.use((err, _req, res, _next) => {
    if (err?.message === "CORS blocked for this origin") {
      return res.status(403).json({ message: err.message });
    }
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          message: `Each file must be under 30MB. For larger files use Pinata: PINATA_JWT in backend/.env and VITE_PINATA_JWT in web/.env (unset IPFS_LOCAL_ONLY).`,
        });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({ message: "Too many files (max 10 per product)." });
      }
      return res.status(400).json({ message: err.message || "Upload rejected." });
    }
    if (err?.name === "MongoServerSelectionError" || err?.name === "MongoParseError") {
      console.error(err);
      return res.status(503).json({ message: `Database unavailable: ${String(err.message || err).slice(0, 200)}` });
    }
    if (String(err?.message || "").includes("MONGODB_URI is required")) {
      return res.status(503).json({ message: "Server misconfiguration: MONGODB_URI is not set." });
    }
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  });

  return app;
}
