# Marketplace

Marketplace lists published digital products for buyers. Search filters the list by title and description. Hidden products stay off this list.

## Sub-features

- `market-open` opens the public products page.
- `market-list` shows published cards with title and price, or `No published products yet.`
- `market-search` filters as the user types.
- `market-open-product` follows a card to the public product URL.
- `market-discover` is the dashboard Discover list, same catalog, behind the wallet shell.

## How to get to it (user POV)

- Open `/products`.
- From the marketing home, choose `Marketplace` (goes to `/dashboard/discover`).
- From the dashboard sidebar, choose `Discover`.
- `GET /api/products` is the data the pages load.

## Driving it with control-rivo

Preconditions:

- `control-rivo doctor` reports `ok: true` and `mode: full-app`.
- If `mode` is `milestone-only`, run `control-rivo browser goto /products` and confirm `Devnet milestone reached`. Stop. This feature is unreachable.

- **Open list.** Run `control-rivo browser goto /products` then `control-rivo browser wait --text "Products on Rivo"`. Subtitle is `Only published products show up here.`
- **Wait for load.** Skeletons disappear. Either product cards with class `product-card` or the empty copy `No published products yet.`
- **API list.** Run `control-rivo api GET /products`. HTTP 200 and a JSON array. Each listed card title must appear in that array.
- **Search.** Type in the search box (placeholder `Search products...`; the wrapping div has `aria-label="Search products"` but the input has no label). Run `control-rivo browser fill --placeholder "Search products..." --value "volcano-not-a-product"`. Empty copy `No published products yet.` appears. Clear the box to restore the list.
- **Open a card.** If a product exists, click the card link. The next page is `/{slug}` when the product has a slug, otherwise `/p/{id}`. Heading matches the card title.
- **Discover entry.** Run `control-rivo browser goto /dashboard/discover`. Without a wallet the connect panel appears (see creator-dashboard). With a wallet, heading `Discover` and search name `Search products`.
- **Proof.** Screenshot and ARIA snapshot under `artifacts/$RIVO_VERIFY_RUN/marketplace.*` showing `Products on Rivo` and either a real title from the API or the empty copy.

## Gotchas

- `/products` and `/dashboard/discover` are different shells. Prove the entry point you named.
- Search is client-side. It does not call the API again.
- Cards with no thumbnail still have a title and price. Assert those, not an image.
- `isShownOnDiscover` / hidden-product rules can hide rows that `GET /api/products` still returns. Assert against the UI list, then explain a mismatch from that filter. Do not treat a hidden API row as a UI bug by itself.
