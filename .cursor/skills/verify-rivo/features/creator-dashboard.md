# Creator dashboard

The dashboard is the creator workspace. With no wallet it shows a connect panel. With a wallet it shows Home, Products, Payments, Purchases, Discover, and Settings.

## Sub-features

- `dash-gate` shows the connect panel on `/dashboard/home` when no wallet is connected.
- `dash-home` shows Dashboard, Getting started, and Activity metrics after connect.
- `dash-products` lists the creator's products and the `New product` action.
- `dash-new` opens the create flow heading `What are you creating?`.
- `dash-nav` switches sidebar destinations without dropping the wallet gate on a fresh unauthenticated load.

## How to get to it (user POV)

- Choose `Start selling` on the marketing home.
- Open `/dashboard/home` or `/dashboard`.
- Header `Start selling` / `Dashboard` links.

## Driving it with control-rivo

Preconditions:

- `control-rivo doctor` reports `ok: true` and `mode: full-app`.
- If `mode` is `milestone-only`, `browser goto /dashboard/home` shows `Devnet milestone reached`. Stop and report unreachable.
- control-rivo has no Phantom. Prove the gate. Treat connected-wallet screens as blocked unless a wallet is actually connected in the Brave profile.

- **Open gate.** Run `control-rivo browser goto /dashboard/home` then `control-rivo browser wait --text "Creator dashboard"`. Subtitle is `Connect your wallet to open your Rivo workspace.` Header text is `Rivo`. A wallet adapter button is visible (`Select Wallet` or `Connect Wallet` depending on adapter copy).
- **Other dashboard URLs.** Run `control-rivo browser goto /dashboard/products`. Same connect panel. The products table heading `Products` must not appear until a wallet is connected.
- **Connected home (only with a wallet).** Heading `Dashboard`. Section `Getting started` includes `Welcome aboard`. Activity metrics: `Balance`, `Last 7 days`, `Last 30 days`, `Total earnings`. Currency trigger can open listbox `Activity currency` with `SOL`, `PUSD`, `USDC`.
- **Connected products.** Run `control-rivo browser goto /dashboard/products`. Heading `Products`. Search name `Search products`. Link `New product`.
- **New product.** Run `control-rivo browser goto /dashboard/products/new` then wait for `What are you creating?`. Button `Cancel` returns to `/dashboard/products`.
- **Proof.** Snapshot and screenshot `artifacts/$RIVO_VERIFY_RUN/dashboard-gate.*` showing `Creator dashboard` and the connect copy. If a wallet is connected, also capture `dashboard-home.*` with heading `Dashboard`.

## Gotchas

- Wallet adapter button names are not stable across locales and extension state. Assert the heading `Creator dashboard`, not a single button string, for the gate.
- Admin (`/dashboard/admin`) is only for wallet `6jaM7rGsMgk81pogFqMAGj7K8AByW8tQTTEnmDYFQpbH`. Skip it unless that wallet is connected.
- Creating a real product uploads files to IPFS or Pinata and writes Mongo. Do not submit the create form from routine verification.
- `Start selling` on the milestone page does not exist. That link is full-app home only.
