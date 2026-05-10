# Rivo

Creators today lose revenue because platforms take 10–20% on their generated income, delay payouts and face global restrictions. Even getting started is difficult—creators often need tools like Stripe or similar payment processors which can be unavailable in many countries, require complex setup and still charge high fees. This creates significant friction before a creator even makes their first sale.

Most existing Web3 marketplaces are not designed for true digital product commerce. They primarily focus on NFTs, art and token-gated access only which require multiple steps and fragmented tools.

As a result, Creators still lack a seamless way to sell digital products where they can get paid instantly and buyers unlock access immediately which is all in one experience and Rivo is built to solve exactly this gap.

Rivo uses Solana to remove these barriers which enabling creators to sell real digital products with low fees, instant payouts and permissionless access.

Buyers pay with their wallet and unlock products instantly—no intermediaries, no delays.

Rivo unlocks the true potential of digital commerce by enabling creators to list real, reusable digital products items that can be sold to unlimited buyers such as SaaS and software licenses, courses and premium guides, developer assets like templates and UI kits and creator packs including design, media and content. It focuses on practical value, allowing users to reinvest their earnings such as rewards from communities like Superteam into tools, knowledge and resources that genuinely improve their skills, productivity and everyday life.

At the same time, Rivo supports exclusive also 1:1 digital ownership through NFTs, enabling creators to offer high-value, limited-access products such as premium software licenses, proprietary AI models or private algorithms, and research or alpha signals. This dual approach combining scalable digital products with verifiable exclusive ownership ensures that creators can monetize across different value tiers while buyers gain both accessible resources and unique, high value digital assets within a single seamless ecosystem.

The current MVP is a Solana-native creator commerce app. A creator connects a wallet, creates a product, sets pricing and payout wallet details and publishes a buyer-facing product page. A buyer connects a wallet, pays on Solana and the backend verifies the transaction before unlocking the purchased file or link. The app already supports product metadata, creator dashboards, buyer purchase history, sales history, split payment logic with a 1% platform fee, backend verification of confirmed Solana transfers and encrypted IPFS delivery for uploaded files.

## Current Product Flow

### Creator

1. Connect a Phantom-compatible wallet.
2. Open the dashboard.
3. Create a digital product with title, description, cover, price, and file.
4. Set a payout wallet.
5. Publish the product.
6. Share the public product link.

### Buyer

1. Open a public product page.
2. Connect wallet.
3. Pay with SOL.
4. Backend verifies the confirmed Solana transaction.
5. Rivo records the purchase.
6. Buyer unlocks the file or content link immediately.

## What Works Today

- React marketplace and buyer-facing product pages
- Wallet-gated creator dashboard
- Product creation, editing, publishing, and listing
- SOL checkout using `SystemProgram.transfer`
- 1% platform fee split in the client transaction
- Backend verification of buyer-to-creator and buyer-to-platform transfers
- Idempotent purchase recording by transaction signature
- Buyer purchase history
- Creator sales history
- Payout wallet settings
- Direct-link delivery mode
- IPFS encrypted delivery metadata after verified purchase
- Vercel deployment layout for frontend + serverless API
- Minimal Anchor `purchase(amount)` program for future on-chain routing

## Currency Status

| Currency | Listing UI | On-chain checkout | Notes                            |
| -------- | ---------- | ----------------- | -------------------------------- |
| PUSD     | Yes        | Yes               | SPL token checkout path          |
| SOL      | Yes        | Yes               | Current production checkout path |
| USDC     | Yes        | No                | Display/listing support only     |
| AUDD     | Yes        | No                | Display/listing support only     |

## Architecture

```text
web/
  React + Vite frontend
  Solana Wallet Adapter + Phantom
  Dashboard, marketplace, buyer pages

backend/
  Express API
  MongoDB/Mongoose persistence
  Solana transaction verification
  IPFS upload and gated unlock metadata

programs/ripple/
  Anchor program for a minimal purchase instruction
```

### Payment Verification

The frontend creates one payment transaction with two splits:

- SOL listings (native lamports): buyer -> creator payout wallet, buyer -> Rivo platform fee wallet
- PUSD listings (SPL token): buyer -> creator payout ATA, buyer -> Rivo platform fee wallet ATA

The backend fetches the confirmed transaction from Solana RPC and verifies:

- the transaction exists and did not fail
- the buyer wallet matches
- the creator payout received the expected amount
- the platform wallet received the expected 1% fee
- the transaction signature has not already been used for another purchase

Only after this check does the API create the purchase record and allow `/api/access/unlock` to return delivery data.

## Tech Stack

- Frontend: React 19, Vite, TypeScript, Tailwind CSS, React Router, Framer Motion
- Wallets: Solana Wallet Adapter, Phantom adapter
- Solana: `@solana/web3.js`, devnet by default
- Backend: Express 5, MongoDB, Mongoose, Zod, Multer
- Storage: IPFS HTTP client with configurable gateway fallback
- On-chain program: Anchor 0.31.1
- Deployment: Vercel static build + Node serverless function

## Repository Layout

| Path                            | Purpose                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `web/`                          | React app, wallet providers, dashboard, marketplace, buyer pages |
| `web/src/lib/payment.ts`        | SOL split-payment transaction builder                            |
| `web/src/lib/api.ts`            | Frontend API client                                              |
| `web/src/types/product.ts`      | Shared product shape used by the UI                              |
| `backend/src/app.js`            | Express app, schemas, product/purchase/access routes             |
| `backend/src/verifyTransfer.js` | Solana transaction verification logic                            |
| `backend/api/index.js`          | Vercel serverless API entrypoint                                 |
| `programs/ripple/src/lib.rs`    | Minimal Anchor purchase program                                  |
| `vercel.json`                   | Root deployment config for frontend and API                      |

## Prerequisites

- Node.js 20+
- MongoDB Atlas URI or local MongoDB
- Phantom wallet on the same Solana cluster as the app
- IPFS daemon or compatible IPFS API if using file uploads
- Optional: Rust + Anchor CLI for program builds

## Environment Variables

### Backend

Create `backend/.env`:

```env
PORT=4000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
SOLANA_RPC=https://api.devnet.solana.com
CORS_ORIGINS=http://localhost:5173
RIPPLE_FEE_WALLET=G6DKYcQnySUk1ZYYuR1HMovVscWjAtyDQb6GhqrvJYnw
PUSD_MINT_ADDRESS=6r8BmwjTEqYKciEuye1QWN8LqEp4sHhRUDjj2Y23t2aY
IPFS_API_HOST=127.0.0.1
IPFS_API_PORT=5001
IPFS_API_PROTOCOL=http
IPFS_GATEWAY_URL=http://127.0.0.1:8081/ipfs
IPFS_GATEWAY_FALLBACK_URL=https://ipfs.io/ipfs
```

`RIPPLE_FEE_WALLET` is still the backend env name for the platform fee wallet. The product is now branded as Rivo, but the legacy env key remains in the code.

### Frontend

Create `web/.env`:

```env
VITE_API_URL=http://localhost:4000/api
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_SOLANA_NETWORK=devnet
VITE_PUSD_MINT_ADDRESS=6r8BmwjTEqYKciEuye1QWN8LqEp4sHhRUDjj2Y23t2aY
VITE_ANALYTICS_DASHBOARD_URL=
```

For Vercel, set `VITE_API_URL=/api` so the frontend calls the same-domain serverless API.

## Local Development

Install backend dependencies:

```bash
cd backend
npm install
npm run dev
```

The API runs on `http://localhost:4000/api`.

Install frontend dependencies:

```bash
cd web
npm install
npm run dev
```

The frontend usually runs on `http://localhost:5173`.

Health check:

```bash
curl http://localhost:4000/api/health
```

Expected response:

```json
{ "ok": true }
```

## IPFS Notes

Product file upload calls `/api/digital-products/upload`, which uses the configured IPFS API. By default, the backend expects:

- IPFS API: `http://127.0.0.1:5001`
- local gateway: `http://127.0.0.1:8081/ipfs`
- fallback gateway: `https://ipfs.io/ipfs`

Only one file is accepted per product in the current UI/API flow. The backend stores the IPFS CID and encrypted delivery metadata, then only returns that metadata after a verified purchase.

## API Summary

All routes are prefixed with `/api`.

| Method | Route                         | Purpose                                      |
| ------ | ----------------------------- | -------------------------------------------- |
| `GET`  | `/health`                     | API health check                             |
| `GET`  | `/products`                   | List published marketplace products          |
| `GET`  | `/products/creator/:wallet`   | List products for a creator                  |
| `GET`  | `/products/slug/:slug`        | Load published product by slug               |
| `GET`  | `/products/:id`               | Load published product by id                 |
| `GET`  | `/products/:id/owner/:wallet` | Load product for owner editing               |
| `POST` | `/products`                   | Create product                               |
| `POST` | `/products/:id/publish`       | Publish product                              |
| `PUT`  | `/products/:id`               | Update product                               |
| `POST` | `/purchases/verify`           | Verify SOL transfer and record purchase      |
| `POST` | `/access/unlock`              | Return delivery data after verified purchase |
| `GET`  | `/download/:productId`        | Return IPFS download metadata for a buyer    |
| `GET`  | `/purchases/wallet/:wallet`   | Buyer purchase history                       |
| `GET`  | `/purchases/creator/:wallet`  | Creator sales history                        |
| `GET`  | `/creators/:wallet/payout`    | Read creator payout wallet                   |
| `POST` | `/creators/:wallet/payout`    | Update payout wallet across creator products |
| `POST` | `/digital-products/upload`    | Upload one product file to IPFS              |
| `POST` | `/analytics/track`            | Ingest a page-visit event                    |
| `GET`  | `/analytics/dashboard`        | Aggregated visitor dashboard metrics         |

## Deployment

The root `vercel.json` deploys:

- `web/` as the static frontend
- `backend/api/index.js` as the serverless API
- `/api/*` to the backend
- all other routes to the SPA fallback

Required Vercel env vars:

```env
MONGODB_URI=
SOLANA_RPC=https://api.devnet.solana.com
CORS_ORIGINS=https://your-domain.vercel.app
RIPPLE_FEE_WALLET=
PUSD_MINT_ADDRESS=
IPFS_API_HOST=
IPFS_API_PORT=
IPFS_API_PROTOCOL=
IPFS_GATEWAY_URL=
IPFS_GATEWAY_FALLBACK_URL=
VITE_API_URL=/api
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_SOLANA_NETWORK=devnet
VITE_ANALYTICS_DASHBOARD_URL=
```

Recommended project settings for fewer runtime issues:

- Build command: `cd web && npm run build`
- Output directory: `web/dist`
- Install command: `npm install` (per project root)
- Node.js runtime: 20.x
- Production branch: `main`

Vercel analytics:

- App-level analytics and Speed Insights are already mounted in `web/src/main.tsx`.
- Vercel-hosted traffic reports appear in Vercel Dashboard -> Analytics.
- In-app visitor dashboard is available at `/dashboard/analytics` (powered by `/api/analytics/*`).

Post-deploy checks:

1. `GET /api/health` returns `{ "ok": true }`.
2. Wallet connects on the frontend.
3. Creator can create and publish a product.
4. Public product page loads by slug.
5. Buyer can complete PUSD checkout (devnet).
6. Backend verifies the transaction.
7. Buyer unlocks the product.
8. Creator and buyer history pages show the purchase.
9. Open `/dashboard/analytics` and confirm page-view metrics are updating.

## Anchor Program

The repo includes a minimal Anchor program:

```rust
pub fn purchase(ctx: Context<Purchase>, amount: u64) -> Result<()>
```

It transfers lamports from the buyer signer to the creator account. The current web app does not route checkout through this program yet; it uses native `SystemProgram.transfer` and backend verification. The program is included as the base for a stricter on-chain purchase rail.

Program id in `Anchor.toml`:

```text
EaEq7oukxo1VA75P5zr8jCVZjNesF7ZavWy2A9QKAqTp
```

Build/deploy when Anchor is installed:

```bash
anchor build
anchor keys list
anchor deploy
```

If building on a case-sensitive filesystem, confirm the workspace member path in `Cargo.toml` matches the actual program folder path.

## Roadmap

- Enable SPL token checkout for USDC.
- Enable SPL token checkout for AUDD.
- Move payment verification from native transfers to the Anchor program.
- Add subscriptions and recurring access.
- Add embedded checkout links for creators.
- Add creator storefront pages.
- Improve content encryption so buyer-side decryption uses a real per-purchase key flow.

## Security Notes

- Never commit real `.env` files.
- Rotate any database credentials that were shared in plain text.
- Keep frontend and backend Solana RPC URLs on the same cluster.
- Treat public IPFS content as public; gate decryption metadata and access through verified purchases.
- Backend unlock checks are required even if the public product page already knows the content URL.
