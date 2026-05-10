import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import multer from "multer";
import crypto from "crypto";
import { create } from "ipfs-http-client";
import { verifySolTransfer, verifySplSplitTransfer } from "./verifyTransfer.js";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const connection = new Connection(process.env.SOLANA_RPC || "https://api.devnet.solana.com", "confirmed");
const RIPPLE_FEE_WALLET = process.env.RIPPLE_FEE_WALLET || "G6DKYcQnySUk1ZYYuR1HMovVscWjAtyDQb6GhqrvJYnw";
const IPFS_HOST = process.env.IPFS_API_HOST || "127.0.0.1";
const IPFS_PORT = Number(process.env.IPFS_API_PORT || 5001);
const IPFS_PROTOCOL = process.env.IPFS_API_PROTOCOL || "http";
const IPFS_GATEWAY_URL = process.env.IPFS_GATEWAY_URL || "http://127.0.0.1:8081/ipfs";
const IPFS_GATEWAY_FALLBACK_URL = process.env.IPFS_GATEWAY_FALLBACK_URL || "https://ipfs.io/ipfs";
const PUSD_MINT = process.env.PUSD_MINT_ADDRESS || "6r8BmwjTEqYKciEuye1QWN8LqEp4sHhRUDjj2Y23t2aY";
const USDC_MINT = process.env.USDC_MINT_ADDRESS || "<USDC_MINT_ADDRESS>";
const USDT_MINT = process.env.USDT_MINT_ADDRESS || "<USDT_MINT_ADDRESS>";
const AUDD_MINT = process.env.AUDD_MINT_ADDRESS || "<AUDD_MINT_ADDRESS>";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const ipfs = create({
  host: IPFS_HOST,
  port: IPFS_PORT,
  protocol: IPFS_PROTOCOL,
});

let mongoConnectPromise = null;

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
    currency: { type: String, enum: ["PUSD", "SOL", "USDC", "USDT", "AUDD"], default: "PUSD" },
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
    currency: { type: String, enum: ["PUSD", "SOL", "USDC", "USDT", "AUDD"], default: "PUSD" },
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
    priceUsdt: z.number().min(0),
    priceAudd: z.number().min(0),
    currency: z.enum(["PUSD", "SOL", "USDC", "USDT", "AUDD"]).optional(),
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
      if (c === "USDT") return d.priceUsdt > 0;
      if (c === "AUDD") return d.priceAudd > 0;
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
    priceUsdt: z.number().min(0).optional(),
    priceAudd: z.number().min(0).optional(),
    currency: z.enum(["PUSD", "SOL", "USDC", "USDT", "AUDD"]).optional(),
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
      if (c === "USDT") return (d.priceUsdt ?? 0) > 0;
      if (c === "AUDD") return (d.priceAudd ?? 0) > 0;
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

  app.use(async (_req, _res, next) => {
    try {
      await ensureDbConnected();
      next();
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

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

  app.get("/api/tokens", (_req, res) => {
    return res.json({
      PUSD: { symbol: "PUSD", mint: PUSD_MINT, decimals: 6, isDefault: true },
      USDC: { symbol: "USDC", mint: USDC_MINT, decimals: 6 },
      USDT: { symbol: "USDT", mint: USDT_MINT, decimals: 6 },
      AUDD: { symbol: "AUDD", mint: AUDD_MINT, decimals: 6 },
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
        priceUsdt: req.body.priceUsdt ?? product.priceUsdt,
        priceAudd: req.body.priceAudd ?? product.priceAudd,
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
      product.priceUsdt = parsed.priceUsdt ?? 0;
      product.priceAudd = parsed.priceAudd ?? 0;
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
    if (checkoutCurrency === "USDT" && (product.priceUsdt ?? 0) <= 0) {
      return res.status(400).json({ message: "This product has no USDT price" });
    }
    if (checkoutCurrency === "AUDD" && (product.priceAudd ?? 0) <= 0) {
      return res.status(400).json({ message: "This product has no AUDD price" });
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
    } else if (checkoutCurrency === "USDT" || checkoutCurrency === "USDC" || checkoutCurrency === "AUDD") {
      const mintByCurrency = { USDT: USDT_MINT, USDC: USDC_MINT, AUDD: AUDD_MINT };
      const humanByCurrency = {
        USDT: product.priceUsdt ?? 0,
        USDC: product.priceUsdc ?? 0,
        AUDD: product.priceAudd ?? 0,
      };
      const mint = mintByCurrency[checkoutCurrency];
      const human = humanByCurrency[checkoutCurrency];
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
              : checkoutCurrency === "USDT"
                ? product.priceUsdt
                : checkoutCurrency === "AUDD"
                  ? product.priceAudd
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
        const result = await ipfs.add(file.buffer);
        uploadedFiles.push({
          ipfsCid: result.cid.toString(),
          fileName: file.originalname || "download.bin",
          mimeType: file.mimetype || "application/octet-stream",
        });
      }
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

      return res.json({
        deliveryMode: "ipfs_encrypted",
        ipfsCid,
        downloadUrl: primaryUrls.downloadUrl,
        backupUrl: primaryUrls.backupUrl,
        encryptedContentKey,
        encryptionAlgorithm: "aes-256-gcm",
        fileName: primary.fileName,
        mimeType: primary.mimeType,
        files: deliveryFiles,
      });
    } catch (error) {
      console.error("IPFS upload failed", error);
      return res.status(500).json({ message: "Failed to upload file to IPFS." });
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
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  });

  return app;
}
