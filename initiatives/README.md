# Initiatives — how big work is run here

A big piece of work spans many sessions. Without a durable home, each new session
re-derives context and drifts. An **initiative** is that home: a fixed set of files per
epic + a resume protocol + a **promotion discipline**, so work — and the _reasoning
behind it_ — survives across sessions and context resets.

> **Canon note.** Everything above the "Project addenda" section is the canonical
> initiatives contract, distributed from the shared AI environment
> (`ai-shared/skills/initiative-new/`) — improve it there, not here. Everything
> project-specific (planning-stack links, how steps are executed, extra resume/close
> steps) belongs in the addenda at the bottom.

## An initiative

`initiatives/<slug>/` holds a fixed set of files (created by `/initiative-new`):

- `charter.md` — goal · scope · non-goals · acceptance criteria · sacred constraints · driving decision(s). Set once, refined rarely.
- `plan.md` — the phased steps with status. The "what & sequence." Each step names its **mechanism** — e.g. a `/feature` run (code), a deterministic pipeline run (data/engine), a design pass (UI).
- `state.md` — **the board**: a scannable status table + the ONE concrete next-action + pointers to open decisions/deferred. The resume entry point. **Updated every session** (the SessionStart hook force-loads it).
- `decisions.md` — D-numbered ratified decisions: one-liner + rationale + status (`RATIFIED`/`OPEN`/`SUPERSEDED`). Step-level calls that don't merit a full ADR. **The SSOT for "why."**
- `deferred.md` — carry-forwards: finding + disposition + status (`OPEN`/`SCHEDULED`/`CLOSED`/`DROPPED`). Where WARNINGs and follow-ups live so they don't get lost.
- `journal.md` — append-only narrative: per session, what happened.
- plus step prompt files and any design/spec docs the initiative needs.

How steps are **executed** (planner/executor split, `/step` pipeline, single-session) is
a per-project choice — documented in the Project addenda, not in the canon. The durable
distillate is promoted into the initiative regardless of where the work ran.

## Resume protocol (anti-context-loss)

Active initiatives are pinned in `initiatives/ACTIVE` — **one slug per line**. Usually
one; more only when genuinely-parallel tracks run concurrently (e.g. in separate
worktrees/sessions). A **global SessionStart hook** (part of the shared AI environment,
not a project file) resolves which one is active for _this_ session and loads only that
board (worktree is deliberately NOT the mapping key — any initiative can be worked from
any worktree):

- **no `initiatives/`** → the hook is silent (it no-ops outside initiative projects).
- **one active** → loads it directly.
- **≥2 active, fresh start** (`startup`/`clear`) → loads no board; the hook asks the
  model to confirm via `AskUserQuestion` which initiative is active, records the pick in
  `initiatives/CURRENT` (gitignored, per-worktree), then loads that board. A hook is a
  shell script, not the model, so it cannot open the prompt itself — it delegates to the
  first turn.
- **≥2 active, mid-session** (`compact`/`resume`) → silently restores the remembered
  pick from `CURRENT` — never re-interrogates while work is in flight.

`/initiative-resume` runs this read. In order: `charter.md` (what & why) → `state.md`
(board + next action) → `decisions.md` **open** entries + `deferred.md` **open** entries
→ `plan.md` → the relevant design docs → the Project addenda below. Trust the promoted
distillate over re-deriving from data, code, or chat history.

## Close-out protocol (run `/initiative-close`)

At the end of any session that touched the initiative:

1. **Promote** (the load-bearing fix): every decision ratified this session →
   `decisions.md` (with rationale); every new carry-forward → `deferred.md` (with
   disposition); anything that lived only in scratch or an external chat → promoted to
   durable initiative docs. **Nothing load-bearing stays only in scratch or an external
   tool.**
2. **Update the board** — `state.md` status table + the next-action handoff.
3. **Append** `journal.md`. 4. **Update** `plan.md`. 5. One docs commit, following the
   project's delivery rules.

## The promotion rule (why this system exists)

Scratch (e.g. gitignored `.feature-dev/`) and chat context are ephemeral; the initiative
dir is the SSOT — checked in, loaded every session. The single discipline that makes the
system reliable: **at every gate (a `/feature` gate, a workflow phase, a planning pass),
promote the durable decisions + their rationale into
`decisions.md`/`deferred.md`/`journal.md`.** This is enforced by the close-out protocol,
the SessionStart hook, and the project rules — it does not depend on the model
remembering.

## Decisions vs working state — doc-map

| Home                                                               | Holds                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| the project's ADR home (e.g. `docs/adr/`), if it keeps one         | durable cross-initiative architecture decisions (the big WHY)                             |
| `initiatives/<slug>/decisions.md`                                  | step-level ratified decisions (the initiative's WHY)                                      |
| `initiatives/<slug>/deferred.md`                                   | carry-forwards / WARNINGs with disposition                                                |
| `initiatives/<slug>/{charter,plan,state,journal}.md` + design docs | WHERE WE ARE                                                                              |
| `initiatives/ACTIVE`                                               | the active slug(s), one per line — the committed set the SessionStart hook chooses from   |
| `initiatives/CURRENT`                                              | this worktree's last-picked slug (gitignored) — menu default + silent mid-session restore |
| scratch (e.g. `.feature-dev/<ts>/`)                                | gitignored, ephemeral — promote out of here at every gate                                 |
| memory                                                             | cross-session pointers (active initiative, durable feedback)                              |

## Starting a new initiative (run `/initiative-new`)

The skill creates `initiatives/<slug>/` from the canonical template, fills the charter
with you, seeds the plan, registers the slug in `initiatives/ACTIVE` (one per line; keep
the list to tracks genuinely being driven in parallel), and — on a project's first
initiative — bootstraps `initiatives/` itself (this README, a gitignored `CURRENT`).

## Project addenda

_Project-specific extensions live below this line and are never touched by canon
updates: planning-stack links (roadmap/ADRs/process docs), the execution model for
steps, extra resume/close-out steps, extra doc-map rows. The global initiative skills
and the SessionStart hook read and honor this section._

- **Execution model:** steps run through the global `/step` pipeline — a planner
  session orchestrating in-session executor/reviewer agents; executors run `/feature`
  in the ROOT working tree (no worktrees). Step prompts live as `step-*-prompt.md`
  files in the initiative dir. The planner owns `CLAUDE.md` and everything under
  `initiatives/` — executor PRs never stage them.
- **Cross-repo:** this service is the bot half of the checkout contract; the shop half
  lives at `../utg-2.0` (workspace `~/projects/contrib/utg/`). Shop-side ledger
  references: `D-12` (the payload `currency` key), `DEF-13` (the bot-side read — closes
  when B1 is live).
- **Prod discipline:** `master` auto-deploys the LIVE relay (Vercel project
  `telegram-bot-server`); every merge is followed by a planner/owner smoke against the
  real bot (owner-sanctioned, TEST-labeled payload). Executors never POST to the
  deployed relay or to Telegram.
