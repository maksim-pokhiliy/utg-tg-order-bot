# bot-polish — plan

Phased. Each step ships via its mechanism — e.g. a `/feature` run (code), a
deterministic pipeline run (data/engine), a design pass (UI). Expect multiple sessions.

| #   | Step                                                                                                                                                | Mechanism                                           | Gate (how it's accepted)                                                                                                                                       | Status  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| B1  | Relay rewrite: zero-dep TS function, `currency` read (DEF-13), HTML-escaped message, validation, auth-if-configured, tests + CI + README + LICENSE | `/step` → one `/feature` executor run               | Charter acceptance criteria minus the B2 line; PR battery green; planner verification; owner merge; prod deploy verified + TEST-labeled smoke in the real chat | NEXT    |
| B2  | Shop-side `x-relay-secret` sender + two-project env enablement; close shop `DEF-13` and `BDEF-1`                                                    | `/step` → `/feature small` run in `../utg-2.0`      | Header sent when env present (shop test); envs set in both Vercel projects; header-less POST to prod relay gets 401; real checkout still lands in the chat     | ✅ done (2026-08-06, shop PR #20) |
| B3  | Relay dual-accepts the v1 and v2 order payloads (shop `requirements.md` §5) and renders each mode's delivery block; contract test pins v2          | `/step` → `/feature` run here                       | v2 order renders in the operators' chat with delivery + contact fields; v1 keeps working byte-identically; both shapes pinned by tests                        | 🔄 executor round open — gates the shop's U5a |
| B4  | Orders become durable: persist every decoded order to Postgres (Neon) BEFORE the Telegram send, keyed by `idempotency_key`; closes BDEF-3        | `/step` → `/feature` run here                       | an order survives a failed Telegram send and can be replayed; a retry with the same key does not duplicate; **a dead database costs an audit row, never an order** — proven by a test with the store unreachable | pending (shop D-11) |

Open design details deferred to their step: handler shape (classic `(req,res)` vs
web-standard `Request→Response`) — executor proposes at the B1 plan gate; exact
validation strictness per field (intent in the step prompt: kills garbage, never breaks
a benign real order); CI Node wiring detail (`node-version-file` reading `engines`).

**B3 context.** The shop drives the contract: `../utg-2.0/initiatives/ua-checkout/`
`requirements.md` §5 is the v2 shape (a `version: 2` envelope with `customer{}` and a
discriminated `delivery.mode` of `np_branch` / `np_postomat` / `np_courier` /
`generic`), ratified as shop-side D-3, and the rollout order — bot dual-accepts FIRST,
then the shop flips, then the bot drops v1 — is shop-side D-9. Until B3 is live the shop
cannot change a single checkout field without either breaking prod ordering or packing
structured data into legacy strings. Deliberately NOT part of B3: dropping v1 (a later
follow-up once the shop has flipped).
