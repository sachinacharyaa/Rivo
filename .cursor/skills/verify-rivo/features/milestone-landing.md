# Milestone landing

The milestone page tells visitors that Rivo finished its devnet volume goal. It shows $5,000 trade volume, 21 buyers, 10+ products, a full progress bar, and footer links to Discord and email. This is what every URL renders while `MILESTONE_PAGE_ONLY` is true.

## Sub-features

- `milestone-open` loads the page from `/` and from an arbitrary path.
- `milestone-copy` shows the badge, title, and thank-you subtitle.
- `milestone-stats` shows Trade volume, Buyers, and Products after the count-up.
- `milestone-progress` shows Devnet goal at 100% complete.
- `milestone-links` exposes Discord and Email in the footer.

## How to get to it (user POV)

- Open `/`.
- Open any other path (`/products`, `/dashboard/home`, `/p/anything`) while the app is in milestone-only mode.

## Driving it with control-rivo

Preconditions:

- `control-rivo doctor` reports `ok: true`.
- `mode` is `milestone-only`. If `mode` is `full-app`, this page is gone; skip and say so.

- **Open home.** Run `control-rivo browser goto /`. The document title is `Rivo — Decentralized Creator Monetization on Solana`.
- **Wait for copy.** Run `control-rivo browser wait --text "Devnet milestone reached"`. The heading contains `Rivo just crossed` and `$5,000`.
- **Confirm stats.** Run `control-rivo browser wait --text "Trade volume"` then `control-rivo browser wait --text "21"` and `control-rivo browser wait --text "10+"`. Do not use `$5,000` as the count-up signal. That string is already in the heading. When the cards finish, Trade volume is `$5,000`, Buyers is `21`, Products is `10+`.
- **Confirm progress.** Run `control-rivo browser wait --text "100% complete"`. The progress head also contains `Devnet goal`.
- **Footer links.** Run `control-rivo browser wait --text "List your product later"` then `control-rivo browser snapshot --path .cursor/skills/verify-rivo/artifacts/$RIVO_VERIFY_RUN/milestone.aria.txt`. The snapshot includes links named `Discord` (`https://discord.gg/THpac3zG5`) and `Email` (`mailto:thesachinacharya77@gmail.com`).
- **Other URLs.** Run `control-rivo browser goto /products` then `control-rivo browser wait --text "Devnet milestone reached"`. The marketplace heading `Products on Rivo` must not appear.
- **Proof.** Run `control-rivo browser screenshot --path .cursor/skills/verify-rivo/artifacts/$RIVO_VERIFY_RUN/milestone.png`. The screenshot shows the Rivo footer brand, `$5,000`, and `100% complete`.

## Gotchas

- Stats count up over about two seconds. The heading already contains `$5,000`, so waiting for that text does not mean the cards finished. Wait for `21` and `10+` instead.
- `prefers-reduced-motion` skips the count-up and still ends at the same numbers.
- A 200 HTML response from Vite is not proof. The SPA shell always contains `id="root"`. Read rendered text.
- In `full-app` mode, `/` is the marketing hero (`Make from 0 to first dollar online`). That is a different feature.
