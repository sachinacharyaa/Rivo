# Rivo

cc
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
# Optional: same Pinata JWT as backend — uploads go from the browser to Pinata (needed for large files on Vercel).
# VITE_PINATA_JWT=
```

For Vercel, set `VITE_API_URL=/api` so the frontend calls the same-domain serverless API.

**Large digital files (e.g. video):** Vercel limits how big a request body can be for serverless functions. Set **`VITE_PINATA_JWT`** to the same (or a scoped) Pinata JWT as **`PINATA_JWT`** so files upload **directly from the browser** to Pinata; the app then calls **`/api/digital-products/register-ipfs`** with only the CIDs (small JSON). Without `VITE_PINATA_JWT`, only smaller files may succeed through **`/api/digital-products/upload`**.

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

**Local dev without Pinata:** Run `ipfs daemon` (Kubo) so the API is reachable. In `backend/.env` set **`IPFS_LOCAL_ONLY=1`** to force Kubo-only uploads and gateway URLs; Pinata keys in the same file are then ignored (useful if you added `PINATA_JWT` for production but want localhost to behave like before). Remove or leave blank `PINATA_JWT` / `VITE_PINATA_JWT` when testing Kubo only.

Pinata env values are **trimmed**; an empty or whitespace-only `PINATA_JWT` does not enable Pinata.

The backend stores the IPFS CID and delivery metadata, then returns download metadata after a verified purchase.

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
# Product file uploads: use Pinata (recommended). Local IPFS (127.0.0.1) is not reachable from Vercel.
PINATA_JWT=
# Same Pinata JWT in frontend (browser upload for large files on Vercel)
VITE_PINATA_JWT=
# Optional: custom gateway (defaults to https://gateway.pinata.cloud/ipfs when Pinata is set)
# IPFS_GATEWAY_URL=
IPFS_GATEWAY_FALLBACK_URL=https://ipfs.io/ipfs
# Legacy Pinata (if not using JWT): PINATA_API_KEY= + PINATA_API_SECRET=
# Local Kubo only if the API is on a public host:
# IPFS_API_HOST=
# IPFS_API_PORT=
# IPFS_API_PROTOCOL=
VITE_API_URL=/api
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_SOLANA_NETWORK=devnet
VITE_ANALYTICS_DASHBOARD_URL=
```

**Uploads on Vercel:** Add `PINATA_JWT` from [Pinata API keys](https://app.pinata.cloud/keys). Serverless routes have a **request body size limit** (often ~4.5 MB on Hobby); very large videos may need direct-to-Pinata uploads from the browser or a larger limit plan.

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
