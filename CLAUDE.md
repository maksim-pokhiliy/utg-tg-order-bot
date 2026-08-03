# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Initiatives (start here for any non-trivial work)

Long-running work is tracked in `initiatives/` — see `initiatives/README.md` for the
system and roles. The active initiative is named in `initiatives/ACTIVE`. Resume
protocol: `charter.md` → `state.md` (board + next action) → open entries in
`decisions.md`/`deferred.md` → `plan.md`. Executor sessions run one scoped step from a
`step-*-prompt.md` file and must not edit initiative files or stage planner artifacts
(`CLAUDE.md`, `initiatives/`) into PRs.

## Project

Telegram order relay for the Ukrainian Tactical Gear shop (volunteer initiative). The
Next.js shop (repo `../utg-2.0` in the same `~/projects/contrib/utg/` workspace, live at
https://www.ua-tactical-gear.com) POSTs the checkout payload here; this service formats
one message and sends it to the operators' chat via the Telegram Bot API
(`sendMessage`, bot `@utg_orders_bot`).

Deployed as Vercel project `telegram-bot-server`, auto-deploys `master`. **LIVE — real
volunteer orders flow through this relay**; every merge must leave it fully functional.

Current state (post `bot-polish` B1, merged 2026-08-03): a typed zero-dependency
Vercel function (`api/place_order.ts` + `src/*`) with a vitest suite, a CI battery
and an ESM load smoke; B2 (shop-side secret sender + env enablement) is next (see
`initiatives/bot-polish/`).

Env (set in Vercel, no local `.env`): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`;
`ORDER_RELAY_SECRET` (optional; shipped in B1 as enforcement-if-configured, the
enablement is B2) gates callers when set.

## The sacred contract

The checkout payload shape is owned by the shop and frozen on both sides. Source of
truth: `../utg-2.0/src/components/checkout/CheckoutForm.tsx` (the sender) and the app's
payload contract test; historical snapshot in
`../utg-2.0/initiatives/production-polish/extracted/bot-contract-index.js`. Rules:

- Never require a key the app does not send; tolerate unknown extra keys.
- Success stays `200` + `{"status":"success"}` — the app checks `response.ok` only.
- The `/place_order` path keeps serving: the shop's `PLACE_ORDER_URL` env points at this
  service and its exact value is recorded in neither repo.
- `currency` (`"UAH" | "USD"`) is authoritative for the money figure (app-side D-12);
  `locale` (`"uk" | "en"`) drives number formatting style only.
- Never call the real Telegram API or the deployed relay from tests or dev tooling —
  tests mock `fetch`. Never commit secrets.
