# Public product

A public product page shows title, price, share, and checkout. Buy now sends a Solana transfer from the connected wallet, then the API verifies the signature before unlock.

## Sub-features

- `product-open-id` loads `/p/:id`.
- `product-open-slug` loads `/:slug` when the product has a slug.
- `product-price` shows the listing currency and amount.
- `product-buy-gate` asks the user to connect a wallet when none is connected.
- `product-buy-chain` (blocked without a wallet) pays and unlocks files.

## How to get to it (user POV)

- Choose a card on `/products`.
- Open a shared `/p/:id` or `/:slug` URL.
- `GET /api/products/:id` or `GET /api/products/slug/:slug`.

## Driving it with control-rivo

Preconditions:

- `control-rivo doctor` reports `ok: true` and `mode: full-app`.
- If `mode` is `milestone-only`, `browser goto /p/<id>` still shows the milestone page. Stop and report unreachable.
- Pick an id from `control-rivo api GET /products`. If the array is empty, skip remaining steps and record that there is no published product to open.

- **Open by id.** Run `control-rivo browser goto /p/<id>` and wait for the product title from the API. Button names include `Share` and `Buy now`. `Add to cart` is visible and is a no-op.
- **Open by slug.** If `slug` is set, run `control-rivo browser goto /<slug>`. Same title as `/p/<id>`.
- **Price.** The price region matches `GET /api/products/:id` (`currency` plus `price` / `priceSol` / `priceUsdc`).
- **Wallet gate.** With no wallet, run `control-rivo browser click --role button --name "Buy now"`. Error toast: `Connect your wallet first (header or wallet button).`
- **Share.** Run `control-rivo browser click --role button --name "Share"`. Button name becomes `Copied` briefly, then `Share` again. Headless clipboard may fail; if the toast never says `Copied`, record the click and the unchanged URL as a limitation, not a product bug, unless the button errors.
- **Paid unlock.** Do not send a transaction. There is no injected Phantom. Report `product-buy-chain` as blocked: needs a connected wallet with balance on the cluster in `VITE_SOLANA_NETWORK`.
- **Proof.** Snapshot and screenshot `artifacts/$RIVO_VERIFY_RUN/public-product.*` showing the title, price, and `Buy now`. Keep the `Buy now` click result (connect-wallet error) in the ARIA snapshot or `browser text` output.

## Gotchas

- `/:slug` also serves creator handles. A missing product slug may render a creator profile (`Creator profile not found.`) instead of a product. Prefer `/p/:id` when proving checkout.
- `Buy now` without a wallet is the expected gate, not a failed payment.
- Unlock copy `Access unlocked` only appears after verify + unlock succeed. A screenshot of the buy button is not unlock proof.
- Network label on the page follows the RPC URL (`devnet` / `testnet` / `mainnet`). It must match `backend` `SOLANA_RPC`.
