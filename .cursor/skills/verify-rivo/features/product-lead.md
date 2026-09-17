# Product lead form

The milestone footer lets a creator leave an email, product name, and one-liner so Rivo can follow up when listings reopen. Submit calls `POST /api/product-leads`.

## Sub-features

- `lead-open` shows the form titled `List your product later`.
- `lead-invalid` keeps Send details disabled until email, name, and one-liner meet length rules.
- `lead-api-reject` returns HTTP 400 for a too-short one-liner.
- `lead-submit` (opt-in only) posts a valid lead and shows a status message.

## How to get to it (user POV)

- Scroll to the footer on any milestone page.
- There is no other UI entry. The API is `POST /api/product-leads`.

## Driving it with control-rivo

Preconditions:

- `control-rivo doctor` reports `ok: true` and `mode: milestone-only`.
- Shared subscribers Mongo is configured (`health` is not enough; a 503 body `Product listings are not configured yet.` means `SUBSCRIBERS_MONGODB_URI` is missing).

- **Open form.** Run `control-rivo browser goto /` then `control-rivo browser wait --text "List your product later"`. Labels `Email`, `Product name`, and `One-liner` are present. The submit button name is `Send details`.
- **Disabled submit.** Do not fill fields. The `Send details` button stays disabled (`canSubmit` requires email length > 3, product name >= 2, one-liner >= 5).
- **API reject.** Run `control-rivo api POST /product-leads --body '{"email":"rivo-verify@example.com","productName":"X","oneLiner":"no"}'`. HTTP 400 and body message `One-liner must be 5–280 characters.`
- **Valid fill (no submit).** Run `control-rivo browser fill --name Email --value "rivo-verify@example.com"`, `control-rivo browser fill --name "Product name" --value "Verify pack"`, and `control-rivo browser fill --name One-liner --value "A pack used only for verification."`. `Send details` becomes enabled. Do not click it unless the task asked to prove delivery.
- **Submit (only when asked).** Run `control-rivo browser click --role button --name "Send details"`. A status role appears with `Thanks — we received your product details.` or `Saved. Email delivery is still warming up — we'll follow up from the inbox.` HTTP 201. This inserts a ProductLead row and may email `thesachinacharya77@gmail.com`.
- **Proof.** Run `control-rivo browser snapshot --path .cursor/skills/verify-rivo/artifacts/$RIVO_VERIFY_RUN/product-lead.aria.txt` and `control-rivo browser screenshot --path .cursor/skills/verify-rivo/artifacts/$RIVO_VERIFY_RUN/product-lead.png`. Artifacts show the form title and the three fields.

## Gotchas

- A successful submit is not a dry run. It writes Mongo and tries inbox delivery. Skip click unless requested.
- Button copy is `Sending…` while the request is in flight.
- Email is lowercased on the server. Assert the status text, not the input value after submit (the form clears).
- `mode: full-app` removes this form. The full-app footer subscribe field is a different endpoint (`POST /api/subscribers`, label `Email address`).
