# Rivo verification map

This directory is the maintained source for verifying user-facing Rivo behavior. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `RIVO_VERIFY_RUN` set and `.cursor/skills/verify-rivo/scripts/control-rivo launch`.
- Run `control-rivo doctor` and require `ok: true` and `ownedByThisRun: true`.
- Read `mode`. `milestone-only` means every URL is the milestone page. `full-app` means the React routes in `web/src/App.tsx` are live.
- Never drive an instance this run did not start.
- Mongo behind `backend/.env` is shared. Do not overlap mutating product-lead or product-create drives.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Prefer role and label names over CSS or coordinates.
- Treat every command as literal.
- Restore nothing on the shared Mongo cluster except what the recipe created, and only when the recipe says to.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with `Rivo` visible.
- API proof includes the method, path, status, and body.
- Record the feature ID and entry point with every artifact.
- If `mode` blocks a path, report the attempted `browser goto` and the unmet `full-app` / `milestone-only` precondition. Do not count the other mode as the same feature.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with control-rivo` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Milestone landing](./milestone-landing.md) covers the current shipping page: badge, volume copy, stats, progress, Discord and email links.
- [Product lead form](./product-lead.md) covers the milestone footer form that collects a future listing.
- [Marketplace](./marketplace.md) covers published product browsing and search. Unreachable while `MILESTONE_PAGE_ONLY` is true.
- [Public product](./public-product.md) covers a product URL, price, and the Buy now wallet gate. Unreachable while `MILESTONE_PAGE_ONLY` is true.
- [Creator dashboard](./creator-dashboard.md) covers the connect-wallet gate and, with a wallet, the home / products / new-product screens. Unreachable while `MILESTONE_PAGE_ONLY` is true.
