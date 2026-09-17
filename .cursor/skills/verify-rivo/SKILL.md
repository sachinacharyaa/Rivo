---
name: verify-rivo
description: Drive the Rivo web app the way a user does (milestone landing, product-lead form, marketplace, public product page, creator dashboard) and capture proof. Use when proving a Rivo UI or API change, verifying dashboard or checkout behavior, or after edits to web/ or backend/.
---

# Verify Rivo

Rivo is a React + Vite SPA (`web/`) talking to an Express API (`backend/`). Buyers and creators use the browser. The waitlist app and the Anchor program are out of scope.

`web/src/App.tsx` currently sets `MILESTONE_PAGE_ONLY` to `true`. Every route renders `MilestoneLandingPage`. Marketplace, product, and dashboard routes exist in the same file but are unreachable until that flag is `false`. Read `features/` before driving. Do not treat a milestone page as proof of those gated paths.

## Launch

Use a disposable instance. Never attach to whatever is already on `:5173` or `:4000`.

```bash
export RIVO_VERIFY_RUN=$$
.cursor/skills/verify-rivo/scripts/control-rivo launch
.cursor/skills/verify-rivo/scripts/control-rivo doctor
```

Launch starts:

- API on `127.0.0.1:14000` (next free port if taken), loading `backend/.env`, with `CORS_ORIGINS` set to the verify web origin
- Vite on `127.0.0.1:15173` (next free port if taken), with `VITE_API_URL` pointing at that API

Ready when `control-rivo doctor` prints `ok: true`. API log line is `Rivo API running on :<port>`. Web is ready when `/` returns HTML that contains `id="root"`.

Needs `backend/.env` with `MONGODB_URI` (the API process does not listen until Mongo connects). Product-lead submit also needs `SUBSCRIBERS_MONGODB_URI`.

Mongo is shared with whatever that `.env` points at. Two verify runs can use different ports. They still share product and subscriber data. Do not run two mutating drives at once. Do not kill processes by name.

## Doctor

```bash
.cursor/skills/verify-rivo/scripts/control-rivo doctor
```

Require all of:

- `ok: true`
- `ownedByThisRun: true`
- `mode: milestone-only` or `mode: full-app`
- `health.ok: true`

If `mode` does not match the feature file you are driving, stop. Milestone features need `milestone-only` (or `full-app` after the flag is flipped, in which case the milestone page is gone). Full-app features need `mode: full-app`.

If doctor fails, read `/tmp/rivo-verify-$RIVO_VERIFY_RUN/api.log` and `web.log`. Do not drive a foreign instance.

## Drive

All browser and API traffic goes through `control-rivo`. Commands are literal. Keep quoted names unchanged.

```bash
BIN=.cursor/skills/verify-rivo/scripts/control-rivo
$BIN browser goto /
$BIN browser wait --text "Devnet milestone reached"
$BIN browser fill --name Email --value "you@studio.com"
$BIN browser click --role button --name "Send details"
$BIN browser snapshot --aria --path .cursor/skills/verify-rivo/artifacts/$RIVO_VERIFY_RUN/page.aria.txt
$BIN browser screenshot --path .cursor/skills/verify-rivo/artifacts/$RIVO_VERIFY_RUN/page.png
$BIN api GET /health
$BIN api GET /products
```

`browser fill` uses the accessible name of a `<label>` (`Email`, `Product name`, `One-liner`). `browser click` uses `getByRole`. Prefer those over CSS and coordinates.

First-time machine setup, once:

```bash
npm install --prefix .cursor/skills/verify-rivo/scripts
```

Browser commands need Brave at `/Applications/Brave Browser.app`.

## Evidence

Put proof under `.cursor/skills/verify-rivo/artifacts/$RIVO_VERIFY_RUN/`. Cleanup must not delete that directory.

A proof is incomplete unless it includes:

- The user action and the resulting state, not only the last screenshot
- An ARIA snapshot and a screenshot that show the word `Rivo` plus the feature-specific copy
- For mutations, a second read (reload the page, or `api GET`) of the stored value
- The feature id and the entry point you actually used

Exercise the real UI or the public `/api/*` routes a user/client hits. Do not call Mongoose models or flip React state from tests. `Buy now` without a connected wallet is a valid proof of the connect-gate. Completing an on-chain transfer is not possible with control-rivo. Report that path as blocked on a wallet. Do not fake a signature.

`POST /api/product-leads` writes the shared subscribers database and emails `CONTACT_INBOX`. Routine verification of the form is: fields present, submit disabled until valid, `POST` with a short one-liner returns HTTP 400. Only send a real lead when the task explicitly asks to prove delivery.

## Cleanup

```bash
.cursor/skills/verify-rivo/scripts/control-rivo cleanup
```

Kills only the API, Vite, and Brave PIDs recorded in `/tmp/rivo-verify-$RIVO_VERIFY_RUN/state.json`. Artifacts stay in `.cursor/skills/verify-rivo/artifacts/$RIVO_VERIFY_RUN/`.

## Helpers

`control-rivo` lives at `.cursor/skills/verify-rivo/scripts/control-rivo`.

```bash
.cursor/skills/verify-rivo/scripts/control-rivo help
```

## Feature map

Index: [features/README.md](features/README.md)
