# bot-polish — plan

Phased. Each step ships via its mechanism — e.g. a `/feature` run (code), a
deterministic pipeline run (data/engine), a design pass (UI). Expect multiple sessions.

| #   | Step                                                                                                                                                | Mechanism                                           | Gate (how it's accepted)                                                                                                                                       | Status  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| B1  | Relay rewrite: zero-dep TS function, `currency` read (DEF-13), HTML-escaped message, validation, auth-if-configured, tests + CI + README + LICENSE | `/step` → one `/feature` executor run               | Charter acceptance criteria minus the B2 line; PR battery green; planner verification; owner merge; prod deploy verified + TEST-labeled smoke in the real chat | NEXT    |
| B2  | Shop-side `x-relay-secret` sender + two-project env enablement; close shop `DEF-13` and `BDEF-1`                                                    | `/step` → `/feature small` run in `../utg-2.0`      | Header sent when env present (shop test); envs set in both Vercel projects; header-less POST to prod relay gets 401; real checkout still lands in the chat     | pending |

Open design details deferred to their step: handler shape (classic `(req,res)` vs
web-standard `Request→Response`) — executor proposes at the B1 plan gate; exact
validation strictness per field (intent in the step prompt: kills garbage, never breaks
a benign real order); CI Node wiring detail (`node-version-file` reading `engines`).
