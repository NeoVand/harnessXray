# Deep Agents capabilities and research roadmap

Reviewed 2026-09-19 against the repository, installed packages, live JavaScript
documentation, and upstream source. Recommendations below are proposals, not
implemented product features.

## What this project actually does

harnessXray is a browser-only agent observatory with a working literature-review
assistant as its specimen. Its strongest product idea is that people can inspect
the real work: context, tools, files, planning, delegation, memory, approvals,
cost, and replay. A useful next version should deepen that observable work.

The research path is OpenAlex/Crossref discovery, arXiv HTML/PDF retrieval,
per-paper notes, article assembly, figures, and a final critic. The four custom
roles are `paper-reader`, `report-writer`, `critic`, and `image-smith`. State and
assets persist locally; `/memories` has a separate cross-conversation lifetime.
This is not currently a general web research engine or an experimental science
platform. Uploaded documents are also inputs, but the citation registry is
specifically organized around arXiv IDs.

The limiting choices are visible in the source:

- `src/lib/agent/prompt.ts` prescribes two or three searches, outline approval
  before deep reading, reading only what the outline needs, and one critique.
  This favors quick article production and can anchor discovery too early.
- `src/lib/agent/subagents.ts` makes each reader return at most 200 words. Richer
  notes exist in files, but the critic is instructed to use six tool calls and
  spot-check at most two claims. That budget is a prompt instruction, not an
  enforced middleware limit.
- `src/lib/agent/tools.ts` defaults `fetch_paper` to **20,000 characters**, with
  a maximum of 60,000. `retrieval.ts` retains untruncated text for verification,
  but the reader sees a prefix. A source marked fetched is not evidence that
  the model examined every relevant section.
- Citation checks reject unknown/unfetched papers and verify optional quote
  matches. They do not establish that a quoted sentence supports the article's
  claim. A missing stored text returns a warning, and prose can still bypass the
  `cite` tool. The README's “structural impossibility” claim is therefore too
  strong for factual attribution.
- The source registry is outside graph checkpoints. Rewind preserves its
  accumulated source knowledge; exact branch provenance needs additional work.

The central research gap is an evidence-driven loop: identify uncertainty,
investigate it, compare findings, then decide whether another search is useful.
Adding workers without that loop will mostly produce more summaries.

## What changed, and what is merely unused

The review baseline was `deepagents@1.12.2`; npm currently publishes `1.14.0`.
The subsequent maintenance update pins `1.14.0` and compatible LangChain peers
in both `package.json` and the tracked `package-lock.json`. The table below
compares capabilities against the original baseline.

| Capability                                  | Status relative to this checkout                                    | Product relevance                                                         |
| ------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Forked subagents (`mode: "fork"`)           | Added in 1.13; API refined in 1.13.3                                | Review a decision using the conversation that produced it                 |
| Skill invalidation (`skillsMetadata: null`) | New in 1.14; per-thread isolation fixed in 1.13.5                   | Edit or create a workflow skill and reload it within an active run        |
| Subagent counter and summarization fixes    | Newer patches than installed baseline                               | More reliable parallel work and independent per-agent budgets             |
| File read pagination/header and deletion    | Changed in 1.13.x                                                   | Better large-file handling; changed tool output/replay assumptions        |
| Dynamic interpreter delegation              | Available before 1.12.2 through a separate package; absent here     | Adaptive batches, routing, comparisons, and bounded follow-up             |
| Structured subagent results                 | Already supported, unused here                                      | Machine-checkable evidence records and claim verification                 |
| Event streaming v3                          | Already present in installed types, unused by current stream driver | Named subagent lifecycle and nested work views                            |
| Remote async subagents                      | Already available, unused here                                      | Long-running work with status, steering, and cancellation; needs a server |
| Profiles and filesystem permissions         | Already available                                                   | Model-specific harness behavior and explicit write ownership              |

Release distinctions are based on the [JavaScript changelog](https://github.com/langchain-ai/deepagentsjs/blob/39b85021d5c64d14539999490610970f76da0b47/libs/deepagents/CHANGELOG.md).
Do not infer JavaScript support from a Python example or from the coding CLI.

## What dynamic subagents mean here

The documented mechanism lets the coordinator generate JavaScript that calls
configured subagents through `task()`. It can process a batch, inspect results,
route unusual cases to another role, and aggregate evidence without making every
intermediate result part of the coordinator's context. It requires the beta
`@langchain/quickjs` interpreter integration.

Three different ideas should have different UI labels: dynamic workflow
dispatch, a fork that inherits conversation context, and a remote async worker.
None implies automatic runtime creation of new tools or specialist definitions.
Start with a small curated role set and let the workflow choose the tasks.
See [dynamic subagents](https://docs.langchain.com/oss/javascript/deepagents/dynamic-subagents),
[forking](https://docs.langchain.com/oss/javascript/deepagents/subagents), and
[async delegation](https://docs.langchain.com/oss/javascript/deepagents/async-subagents).

## Recommended features, in priority order

### 1. Evidence ledger and section-aware reading

Make research produce reusable evidence before it produces prose. A structured
record should carry the question, source ID/version, section or page, exact
supporting span, claim, experimental conditions, limitations, and whether it
supports or contradicts the question. Distinguish retrieved, examined, and
verified evidence.

Add tools to list paper sections, search stored full text, and fetch a particular
section or passage. The cached full text already gives this a foundation.
The reader can then inspect methods and limitations even when they fall beyond
the current text prefix. Use structured subagent output plus application-level
validation. Persist records by stable source/claim IDs rather than overwriting
one shared notes file from multiple workers.

**User experience:** click any substantive sentence in an article to see the
source passage and why it supports the claim. **Success criterion:** all key
claims have locatable evidence, or are explicitly marked unresolved. A quote
match alone must not label a claim “verified.”

### 2. Adaptive investigation workflow

Offer a separate “Investigate a question” workflow alongside the existing quick
review. For example: “When does retrieval actually improve factual accuracy?”

The coordinator starts with a provisional question map, sends scouts to distinct
literatures, and deduplicates their results. It dispatches readers only for
promising evidence, then asks a synthesizer which uncertainties remain. Further
work targets those gaps rather than expanding every branch equally. Approve an
article outline after the initial evidence pass; allow evidence to revise it.

Suggested new roles are `literature-scout`, `methods-reader`, and
`evidence-synthesizer`, reusing the existing reader where appropriate. Dynamic
dispatch chooses instances and briefs from these roles. Use modest batches,
shared deduplication, source/provider rate limits, and enforced total research
budgets. Stop when key questions have evidence and another pass adds little,
or when the budget is reached; report unresolved gaps in either case.

**User experience:** an investigation tree shows questions, attempted searches,
evidence found, dead ends, and the reason for the next branch. **Success
criterion:** broader question coverage and fewer missed counterexamples at a
comparable spend to the current workflow.

### 3. Contradiction investigations

When two papers appear to disagree, create a targeted branch. One worker checks
definitions and assumptions, another examines datasets and evaluation protocols,
and an independent verifier looks for evidence against the apparent consensus.
The synthesis classifies the mismatch: genuine disagreement, different settings,
incomparable metrics, or insufficient evidence.

For example, “Method A beats B” is not a contradiction of “B beats A” until the
tasks, resource budgets, and metrics are comparable. This is where delegation
adds depth rather than volume. Avoid deciding truth by majority vote between
agents; resolve disagreement using primary evidence.

**User experience:** a disagreement card opens into the competing claims and
their conditions. **Success criterion:** no merged comparison silently treats
different experimental settings as equivalent.

### 4. Claim-level peer review and targeted repair

Replace the single generic critique in the investigation workflow with separate
evidence, methods, and editorial checks. Give the factual reviewer the draft and
source evidence in an isolated context so it need not inherit the writer's
reasoning. A fork is useful for an editor who needs the user's preferences and
the history of outline decisions.

Return structured findings with claim IDs, severity, evidence, and proposed
repair. Repair only affected claims, then recheck those repairs within a bounded
budget. Keep the current cheap one-pass critic for quick reviews.

**User experience:** inspect the finding, source passage, and before/after text.
**Success criterion:** fewer unsupported claims in a blinded review, including
claims that carry a real citation but overstate what the paper demonstrates.

### 5. Living dossiers and article updates

Persist a project dossier containing the question map, evidence ledger, excluded
papers and reasons, unresolved disagreements, and article version. On an explicit
update request, search for relevant new work, identify which conclusions changed,
and revise only affected sections.

This requires a research-project storage scope, separate from today's personal
`/memories` preferences and per-chat files. Add citation/reference traversal to
discovery rather than only keyword search. Supporting DOI-first sources and
uploaded documents also requires a generalized source identity/provenance model.
Automatic scheduled research would require an additional execution service; a
closed browser tab cannot perform it reliably.

**User experience:** “What changed since this article?” with a sourced change
report. **Success criterion:** evidence is reused across chats without silently
mixing source versions or carrying stale claims into a new article.

### 6. Make the new work visible in the X-ray

Extend the current subagent lanes into a workflow view: batch membership,
parent/child relationships, input source set, output evidence, retries, context
mode, and measured cost. Show one role separately from its many task instances.
Distinguish data held in the interpreter from tokens actually sent to the model;
do not report interpreter byte counts as measured token savings.

Explore [event streaming v3](https://docs.langchain.com/oss/javascript/deepagents/event-streaming)
for named lifecycle projections while preserving wire capture. Current lane
matching relies on ordinary parent `task` calls and dispatch order; interpreter
dispatch needs explicit validation. A compiled graph view is not itself the
runtime investigation tree.

Add replay fixtures showing a failed branch, a changed hypothesis, and a claim
corrected after review. These would teach more about research than a larger
successful article alone.

## Implementation sequence and real constraints

1. Upgrade Deep Agents and compatible peers deliberately in a separate runtime
   change. Pin/reproduce the tested dependency set. Exercise existing harness,
   skills, compaction, citation, lane, persistence, gate, and replay tests; build
   the static site. The read-file format and prompt changes matter to fixtures.
2. Implement evidence records, passage retrieval, and a small structured reader
   workflow using normal delegation first. This delivers research value without
   coupling it to a beta interpreter migration.
3. Prove one browser interpreter workflow using two read-only readers. Verify
   WASM loading in a production build, correct attribution, output validation,
   child-file merging, cancellation, and recovery. The current bridge unwraps
   Command results to content; do not assume normal ToolNode file merging.
4. Add adaptive follow-up and contradiction workflows with per-branch budgets
   and a total run budget. A prompt saying “six calls” is not enforcement.
5. Add fork-aware editing and live skill reload. The current UI seeds skills
   metadata manually; a rescan must not resurrect disabled skill files.
6. Consider remote async execution only if users need research to continue after
   closing the tab. Move browser-only registries/assets behind a shared access
   layer before expecting remote workers to use them.

The browser async-context shim uses a single mutable context slot. The existing
gate middleware already compensates for some parallel approval limitations.
The interpreter bridge also bypasses parent ToolNode wrappers. Start with
read-only research roles, and leave image spending and outline approval on the
existing path until nested pause/resume is demonstrated. These are concrete
integration constraints, not reasons to abandon browser-local orchestration.

The latest interpreter is not yet installed or browser-tested in this project.
Current [QuickJS types](https://github.com/langchain-ai/deepagentsjs/blob/39b85021d5c64d14539999490610970f76da0b47/libs/providers/quickjs/src/types.ts)
and [implementation](https://github.com/langchain-ai/deepagentsjs/blob/39b85021d5c64d14539999490610970f76da0b47/libs/providers/quickjs/src/middleware.ts)
are more reliable than its older README examples: the current export is
`createCodeInterpreterMiddleware`, the tool is `eval`, PTC takes an explicit
tool list, and the public middleware has a fixed subagent concurrency cap of 32.
`maxPtcCalls` limits bridged tool calls, not all child-agent spending. Interpreter
variables are cleaned up after the run and are not a durable research store.

## Skill refresh performed

Compared all 15 installed skills from `langchain-ai/langchain-skills` against
commit `88df7d9b0cf8fedf40b99c1de806135fc2e2582d`. Only
`langgraph-fundamentals` had upstream changes; its new language-specific references
are included. The upstream Deep Agents skills still contain stale defaults.

Also checked `openai/skills` at `49f948faa9258a0c61caceaf225e179651397431`
and `huntabyte/shadcn-svelte` at `cca0797342bb6cca361a97e61cfab90e68167c04`.
Their installed skills already match upstream. All 17 skill directories retain
official upstream contents; no local skill rewrites or supplements are included.
The lock updates the content hash for the refreshed LangGraph skill.

Stale upstream claims remain findings for this review, not edits to vendored
skills: planning is no longer universally enabled, synchronous isolation is not
the only delegation mode, and thread-scoped state can survive reload when backed
by a durable checkpointer. The subsequent maintenance update upgrades the harness
and its required peers, adapts skill-state handling to 1.14, and selects
`gpt-image-2.5-flare` for generation and editing. The research workflows proposed
above remain future work.

Verification also found stale search recordings in the bundled demo: the
current retrieval code includes locations, sorts recency by date, and assembles
query parameters differently. Its six OpenAlex responses were freshly captured
for those requests. The model exchanges and paper recordings remain historical;
the demo validates orchestration, not fresh model reasoning or live model access.

## Maintenance verification

- 215 tests pass across 31 files, including real skills middleware, streamed image
  generation, multipart image editing, and all six bundled search recordings.
- Type checking reports zero errors or warnings; formatting and lint pass.
- The production build passes with `BASE_PATH=/harnessXray`.
- Browser replay completes 49 exchanges, outline approval/resume, subagent work,
  and five note/article writes. The saved article survives reloading.
- The historical model recording still requests `write_todos` from subagents
  that no longer expose it and contains a `write_file` call with `todos`
  arguments. The invalid call is present in the original committed fixture;
  these handled tool errors are not regressions introduced by this update.
  A new model recording would be needed for a clean demonstration of current
  model behavior. No paid model calls or live Flare access checks were made.
