# harnessXray — Build Plan

> An X-ray lab for the anatomy of a mini AI brain.
> Left: a real Deep Agent that writes review papers. Right: everything it is made of, exposed.

**Status:** researched (16 agents), critiqued, and adversarially verified (8 agents running real builds,
bundles and network probes). Claims below are marked **[proven]** where a command was actually run, and
**[to prove]** where they are still assumptions with a scheduled gate.

---

## 0. Thesis

The course is not about `deepagents` syntax. It is about **how the pieces fit together to make something
that behaves like a mind** — and about giving a student the *vocabulary of ideas* they need to describe a
custom brain to a coding model and have it built.

So the product requirement is **total transparency, minimal chrome.** Every byte that goes into the model
and every byte that comes out is visible, at every moment, without the UI shouting.

Three invariants everything else serves:

1. **Nothing is hidden.** Raw HTTP body, raw SSE frames, assembled prompt with per-fragment token cost,
   live context composition, filesystem, memory, skills (present vs. *active*), graph topology, state deltas.
2. **The agent does not know it is observed.** `src/lib/agent/**` contains zero telemetry calls. Delete the
   instrumentation folder and you have a working, silent agent.
3. **Retro-minimal.** Hairlines, not cards. Small radius. Mono micro-labels. Type and space do the work.

---

## 1. Decisions locked

| # | Decision | Basis |
|---|---|---|
| **D1** | **Browser-only static SPA.** `adapter-static`, no server, ever. | **[proven]** Search via OpenAlex (`ACAO: *`, real results); full text via `arxiv.org/html/<id>` and `arxiv.org/pdf/<id>` (both `ACAO: *`, the latter through its redirect). arXiv's *search* API sends no ACAO — we route around it. |
| **D2** | **Real `deepagents@1.11.1` (browser build) as substrate, made into a glass box by instrumentation.** | **[proven, with scope]** `dist/browser.js` emits zero `node:` imports of its own. It does **not** bundle for the browser unaided — see §2.2. Four shims fix it; that work is day-one scope, not a contingency. |
| **D3** | **Four capture planes, one correlation broker, one append-only event log.** | P1 **[proven]**, P4 **[proven]**, P2/P3 **[to prove — M4]**. |
| **D4** | **`compute` = real model-written JS in a Worker isolate; `plot` = declarative spec → SVG → virtual filesystem.** | Your LangX Analytical Engine pattern. All source files verified present. |
| **D5** | **One event schema:** capture kind + display kind + `branchId`. | The `__interrupt__` payload shape is now known exactly, so this can be written *before* M2. |
| **D6** | **Record/replay fixtures are a first-class milestone.** | Offline classroom mode, deterministic Playwright, demo that survives venue wifi. |
| **D7** | **`gpt-image-2`**, not "GPT Image 2.1". | Verified: current model is `gpt-image-2` (snapshot `gpt-image-2-2026-04-21`). No 2.1 exists; there *is* a `gpt-image-1.5`, likely the mix-up. Returns **`b64_json` only** (no `url`), *may* require org verification, output billed at **$30/1M tokens** — so it stays HITL-gated. |

**Model layer** goes through LangChain (`ChatOpenAI`) so Azure is a later swap. The one exception is image
generation — LangChain has no `gpt-image-2` wrapper — so that tool calls REST directly, isolated behind an
`ImageProvider` interface.

---

## 2. Architecture

### 2.1 Runtime

```
query ──▶ OpenAlex  (ACAO *, keyless)  ── arXiv id + abstract + citation counts
              ▼
        arxiv.org/html/<id>v<n>   ← preferred: LaTeXML, real sections, real math
              │ 404 / pre-2024
              ▼
        arxiv.org/pdf/<id>        ← pdfjs-dist + 2-column reconstruction (from voicebook)
```

Fallbacks, zero-infrastructure: OpenAI hosted web search scoped to `arxiv.org` (also a *teaching* artifact —
provider-native vs. client-side tools side by side), and Crossref for DOI resolution.

**Rejected:** `+server.ts` proxies (work in dev, 404 in the static build — the classic way to ship a demo
that only works on your laptop) and third-party CORS proxies (rate-limited or dead).

### 2.2 Day-one scope items that verification promoted from "risk"

**The build is red, and the fix is exact. [proven by matrix test on a repo copy]**
`@sveltejs/adapter-static` throws `Encountered dynamic routes` at `closeBundle` (bare `adapter()` defaults to
`strict: true`); `vite build` itself succeeds. **`src/routes/+layout.ts` with `export const prerender = true`
is necessary and sufficient** — it passes even with the demo routes still present. `ssr = false` alone does
*not* fix it, and deleting demo routes alone does *not* fix it.
Add `ssr = false` anyway as a **deliberate choice, not the fix**: `@hugeicons/svelte` injects SVG paths in
`onMount`, so with SSR on the prerendered HTML ships empty icons until hydration.

**`deepagents/browser` needs four shims. [proven with esbuild]**
Its own code is clean, but the browser-reachable chunk statically imports `micromatch` and
`langsmith/experimental/sandbox`. `esbuild --platform=browser` fails with 7 unresolved builtins; the same
entry succeeds with `--platform=node`. Required: (a) `path` → `path-browserify` — picomatch uses **top-level
CJS `require('path')`**, a hard load-time failure; (b) a `util` shim for micromatch/fill-range, same
top-level CJS; (c) `node:fs/promises` + `node:path` stubbed for the langsmith sandbox client — these are
lazy `await import()`, so they only break if `LangSmithSandbox` runs; (d) a `process.env` define (14
references survive, including `process.env.LANGSMITH_API_KEY` as a constructor default).
**[to prove — M1]** This was measured with esbuild. The repo is on Vite 8 / **rolldown**, a different
resolver with its own dep-optimizer path, so M1 must prove **both** `vite dev` and `vite build`.

**The ALS constraint is stricter than "no `await` first". [proven]**
No shim → `Called interrupt() outside the context of a graph`. A mock ALS → also throws. LangX's 56-line
`SyncAsyncLocalStorage` → interrupt returns, `getState().tasks[0].interrupts` matches, `new Command({resume})`
completes the run. But the shim restores the previous store in a `finally` the moment the callback yields, so
`interrupt()` must be reached with **no `await` having executed anywhere in the node's synchronous prologue,
including inside helpers it calls**. One `await Promise.resolve()` breaks it. Architectural rule:
`interrupt()` is the first statement in its middleware, every value it needs computed synchronously before.
Both `@langchain/langgraph` and `/web` resolve to `dist/web.js` under the browser condition — the shim is
required regardless of specifier.

### 2.3 The four capture planes

| Plane | Mechanism | Owns |
|---|---|---|
| **P1 Wire** | `configuration.fetch` on `ChatOpenAI` | **[proven]** The literal outbound JSON body, raw SSE frames, `x-request-id`, true latency |
| **P2 Semantics** | custom `createMiddleware({ wrapModelCall, wrapToolCall })` | **[to prove — M4]** Pre-serialization LangChain view: `BaseMessage[]`, `StructuredTool[]`, the tool `artifact` that never reaches the wire, and short-circuit ability |
| **P3 Span tree** | `BaseCallbackHandler` via `config.callbacks` | **[to prove — M4]** `runId`/`parentRunId` — the edges that make a trace a *tree* — plus per-token deltas |
| **P4 Graph** | `agent.stream(..., { streamMode: [...], subgraphs: true })` | **[proven]** Super-steps, per-node state deltas, checkpoint envelopes, subgraph namespaces identifying subagents |

**P1 is proven outright, not hoped for.** `configuration` is spread verbatim into `new OpenAI(...)`
(`base.js:227–232`), so our fetch receives the literal request. Empirically captured: URL, method, auth
header, and body `{model, ...params, stream, [stream_options], [tools], messages}` with `messages`
serialized last. `ReadableStream.tee()` does **not** break LangChain's SSE parsing — both branches consumed,
final `AIMessageChunk` content, `usage_metadata` and `finish_reason` all correct. Note
`dangerouslyAllowBrowser` lives at **`configuration.dangerouslyAllowBrowser`** (a top-level key is silently
ignored) and LangChain already defaults it to `true`.

**P4 shape correction.** All five modes are in the exact 1.4.x `StreamMode` union and all five emit. Chunks
are 3-tuples `[namespace, mode, payload]` where **`namespace` is `string[]`, not a string** (`[]` at root,
`["child:<taskId>", ...]` when nested). **Always pass an array** — with `subgraphs: true` and a single string
mode the tuple collapses to 2-arity and `mode` disappears.

A per-scope **correlation broker** fuses the planes with a content fingerprint, because LangChain forces the
OpenAI client to `maxRetries: 0` and retries at its own layer — producing **`maxRetries + 1` (default 3)**
identical bodies per logical call. They resolve to one `model_response` stamped `retryCount`, and the
retries still appear as their own wire rows, which is itself a lesson. Fixtures therefore key on
**(body hash, attempt)**, not body hash alone.

### 2.4 Event + state model

One `HxEvent` union with `captureKind` (~30, precise) and `displayKind` (9: user · model · tool · state · fs ·
memory · subagent · interrupt · error), plus `branchId` so checkpoint forks are a tree, not a line.

The `__interrupt__` payload is known exactly **[proven]**: top-level key `__interrupt__`, a plain array of
plain objects with exactly `{ id, value }`, where `id` is a 32-char hex hash of the checkpoint namespace and
`value` is the `interrupt()` argument verbatim. Identical on 1.3.2 and 1.4.8.

The log is a **plain non-reactive array** with a rAF-batched version counter and incremental indexes — deep
`$state` over 20k events would kill the UI **[to prove — M5 is the gate]**. Every pane is a pure fold over
the log, so **replay and time-travel come free**.

---

## 3. The agent

**Tools:** `search_papers` (OpenAlex) · `fetch_paper` (HTML→PDF ladder) · `cite` (shared source registry so
every subagent cites the same paper as the same `[S3]`) · `compute` (the Mill) · `plot` (spec→SVG→VFS) ·
`generate_figure` (`gpt-image-2`, HITL-gated) · `present_plan` (HITL gate) · `render_paper`.

**Subagents:** `paper-reader` (one per paper, parallel — the fan-out set-piece) · `critic`.

**Skills:** authored as real markdown, `?raw`-imported. Written into the **initial input state** at run start
(or a `StoreBackend`) — *not* "at build time", which is impossible against a `StateBackend`.

**Interrupts:** `present_plan` and `generate_figure`, plus a user-initiated stop/steer path. **HITL has
exactly three decision literals — `approve` | `edit` | `reject` [proven]**, identical across langchain 1.0.1
and 1.5.4. There is no `respond`; the approval card has three buttons, full stop.

**Paper editing** (a gap the critique caught): edits from the viewer must land in the agent's `files` channel
via `updateState` as-node, or the next `edit_file` silently overwrites you. Note this interacts with the
`StateBackend` finding below — the write path needs its own assertion, and is a **[to prove — M9]** item.

**Prompt injection** is built into the demo arc: one seeded paper carries an injected instruction. You watch
it enter context through `fetch_paper`, watch the model obey, then apply the mitigation.

---

## 4. UI

Retro-minimal: hairline rules instead of card borders, the existing `--radius: 0.45rem` kept small, uppercase
mono micro-labels, restrained color. The zinc theme's five `--chart-*` tokens are all grays **and byte-identical
between the light and dark blocks** — theme-invariant, so event kinds need their own `--hx-*` palette.

```
┌ header 56px ─ run ▾ · status · model ▾ · ctx ▓▓▓░ · $0.14 · ⚙ ☾ ? ────────────┐
├──────────── APP 38% ──────────┬─ TIMELINE 22% ─┬───── INSPECTOR 40% ──────────┤
│ conversation                  │ event rows     │ Raw·Tool·State·Graph·FS·Mem· │
│   tool-call cards, reasoning, │ +tokens, kind  │ Todos·Prompt·Skills·Context   │
│   todos, citations, approvals │ subagent lanes │                              │
│ ─── composer (sticky) ────    │                │                              │
│ paper viewer (collapsible)    │                │                              │
├───────────────────────────────┴────────────────┴──────────────────────────────┤
│ TIME DOCK — full width. Scrubbing rewinds chat AND inspector together.        │
└───────────────────────────────────────────────────────────────────────────────┘
```

The dock spans **both** columns on purpose: time is a property of the run, not a feature of the X-ray pane.

**Graph view: commit to Mermaid [proven].** `compiled.getGraphAsync({ xray: true }).drawMermaid()` returns
the real compiled topology — subgraphs expand inside a `subgraph … end` block, conditional edges render
dotted. Without `xray` the subgraph collapses to one node. Sync `getGraph()` is `@deprecated`. voicebook
already ships a hardened Mermaid component.

**Resizable is real and installed [proven]** — `npx shadcn-svelte@latest add resizable -y` produced 3 files
and resolved `paneforge@1.0.2`. End-to-end on a repo copy: Resizable + hugeicons + prerender → build green,
`npm run check` **411 files, 0 errors**.

### Appendix — hugeicons contract (the shadcn-svelte skill documents only lucide/tabler)

```svelte
import { HugeiconsIcon } from "@hugeicons/svelte";      // NAMED export
import { BrainIcon } from "@hugeicons/core-free-icons";
<HugeiconsIcon icon={BrainIcon} strokeWidth={2} />
```

The icon is a **value passed to the `icon` prop**, not a component — lucide-style `<BrainIcon />` will not
work. Inside `<Button>`, use `data-icon="inline-start"|"inline-end"` and **no** sizing classes.
`@hugeicons/core-free-icons@4.2.3` exports 13,556 symbols. **Do not guess names.** Runtime-verified real:
`BrainIcon`, `AiBrain01Icon`, `AiMagicIcon`, `SparklesIcon`, `RobotIcon`, `File01Icon`, `FileCodeIcon`,
`Folder01Icon`, `TerminalIcon`, `CodeIcon`, `GitBranchIcon`, `GitGraphIcon`, `FlowIcon`, `NodeAddIcon`,
`DatabaseIcon`, `KeyIcon`, `Settings01Icon`, `PlayIcon`, `PauseIcon`, `Search01Icon`, `LayersIcon`,
`Clock01Icon`, `Tick01Icon`, `Alert01Icon`, `CpuIcon`, `Bug01Icon`, `Chart01Icon`, `ActivityIcon`.
**Do NOT exist:** `GraphIcon`, `NodeIcon`, `SparkleIcon`.

---

## 5. Reuse

**LangX** — `async-context.ts` (**exactly 56 lines**, non-negotiable), the tracer, Dexie storage, the Mill
compute worker (arquero + simple-statistics + 8s timeout), `createSourceRegistry()` (`research/index.ts:264`),
prompt-section attribution, context tape/meter, file tree, todo panel, diff, `StateInspector.svelte` (its
`lc_kwargs` replacer at **lines 20–26** is ten of the highest-leverage lines in either repo), and the
**132KB glossary of 335 already-written concept definitions** (78 general · 99 langchain · 62 langgraph ·
96 deepagents, zero duplicates) — enormous writing saved.

Do **not** copy LangX's version pins — confirmed below the deepagents floor (`langgraph 1.3.2` vs `^1.4.4`,
`core 1.1.48` vs `^1.2.0`). Pin these six exactly:

```
@langchain/core ^1.2.0 · @langchain/langgraph ^1.4.4 · @langchain/langgraph-checkpoint ^1.1.2
@langchain/langgraph-sdk ^1.9.23 · langchain ^1.5.0 · langsmith ^0.7.1
```

**voicebook** — the markdown pipeline (`parseMarkdown` at **537–927**: unified/remark → flat blocks with
source-offset anchors, giving provenance for free), the structural sanitizer (**397–496**, a 20-tag
allowlist; `grep -rn "@html" src` returns nothing), 2-column PDF reconstruction (**1210–1256** — real
algorithm: per-row largest-gap, `>180` split threshold, requires ≥3 candidates and ≥30% of rows), KaTeX and
Mermaid components, `ApiKeyField`, and the IndexedDB multi-tab guard.
Do **not** take the TTS stack, DOCX paths, or `prose` on the paper viewer.

---

## 6. Build sequence

| M | Goal | Done when |
|---|---|---|
| **M0** ✅ | `src/routes/+layout.ts` (`prerender = true` is the fix; `ssr = false` for hugeicons), `git init`, install at the six peer floors | **Done.** `npm run build` green, `npm run check` 779 files / 0 errors |
| **M1** ✅ | `deepagents/browser` under **Vite 8 / rolldown** — both `vite dev` and `vite build` | **Done.** Agent compiles in-browser; topology reads back 7 nodes / 8 edges with real middleware names. Shims needed: `path`, `util`, `node:fs/promises`, **and `process.env`** (the 4th was found at runtime, not build time) |
| **M2** ✅ | ALS shim, `interrupt()`, resume | **Done.** `__interrupt__[0].value` observed; `Command({resume})` completed the run |
| **M3** ✅ | Wire capture — literal HTTP body and SSE frames | **Done.** Proven live: 31.3KB request showing real tool JSON Schema + deepagents' own `write_todos` prompt. Found `gpt-5.6` needs `useResponsesApi` for function tools |
| **M3.5** ✅ | App shell, chat, timeline, inspector, settings, icons, theme | **Done.** Three panes, live streaming, tool cards, BYO-key + `.env` dev key (constant-folded out of prod, verified) |
| **M4** | Fuse P2 (middleware) + P3 (callbacks) into one span tree | A two-tool run produces one correct tree with real node boundaries |
| **M5** | Load-test 20k events; virtualize the timeline | Scrolls at 60fps |
| **M6** | Fixture record/replay, keyed on (body hash, attempt) | Full demo runs offline with no key |
| **M6.5** | `IdbCheckpointSaver` — **never scheduled in the original plan, and HITL + time travel + threads all need it** | State survives reload; `getStateHistory` works |
| **M7** | Retrieval end to end + CORS probe board | Papers fetched and parsed in-browser |
| **M8** | The paper agent: tools → subagents → skills → interrupts | Writes a real paper; approval card works |
| **M9** | Paper viewer + editing write-path | Your edits survive the next agent turn |
| **M10** | Remaining inspector tabs: state diff, filesystem, memory, todos, prompt assembly, context tape, cost | Every concept has a surface |
| **M11** | Time dock, replay, branching | Scrub rewinds both panes |
| **M12** | Prompt-injection lesson, ablation mode, lab drawer, command palette | — |

**Before M1**, one cheap probe: a single POST to `api.openai.com` with a *valid* key, confirming the response
carries `ACAO`. Every browser-side call depends on it and no valid key was used in verification.

**Ablation mode** (M12): toggles for each harness feature with a side-by-side run diff. Turns "the harness is
the product" from an assertion into an instrument the student can operate.

---

## 7. Top risks

1. **`interrupt()` context dies before HITL fires.** Mitigated by the strict ordering rule in §2.2. Round-trip
   proven; the *middleware ordering* is the remaining unknown — gated at M2.
2. **`deepagents` under rolldown.** Four shims proven necessary with esbuild; rolldown must be re-proven at M1.
   Fallback: LangX's harness behind the same interface.
3. **`arxiv.org/pdf` ACAO is operational, not contractual.** All fetches behind one seam with a fallback ladder
   and a live reachability board, so failure is visible rather than mysterious.
4. **`StateBackend` must not be written outside a graph run — and nothing enforces it.** It uses the private
   `__pregel_read`/`__pregel_send` config keys. Outside a run it throws an *incidental* `TypeError`; worse,
   inside a plain LCEL Runnable `write()` **silently no-ops yet returns a success shape**. We add our own
   explicit assertion, because the library will not.
5. **A present-but-invalid key is intercepted at the edge** on `/v1/chat/completions`, `/v1/responses` and
   `/v1/images/generations`, returning a `text/plain` 401 with **no ACAO** — so `fetch` rejects with a bare
   `TypeError` and we can read neither status nor body. The mechanism is bad-key-vs-no-key, not GET-vs-POST.
   `/v1/models` is exempt and returns a readable 401. So: validate on entry with `GET /v1/models`, and on any
   bare `TypeError` re-probe `/v1/models` before blaming the key — it is genuinely indistinguishable from
   being offline.
6. **Prompt-cache breakpoints are Anthropic-only.** On OpenAI the only real signal is implicit
   `prompt_tokens_details.cached_tokens`. Teaching explicit breakpoints here would teach a falsehood.

---

## 8. Exact token accounting (M10)

`POST /v1/responses/input_tokens` **exists** (SDK 6.49.0, `client.responses.inputTokens.count`); response is
exactly `{"input_tokens": number, "object": "response.input_tokens"}`, preflight open.

Two caveats. (i) It is a **Responses-API** endpoint, but our default `ChatOpenAI` path is
`/v1/chat/completions`. Either translate the captured body and label the number "Responses-equivalent", or
set `useResponsesApi: true` (verified: routes through the same `configuration.fetch`) so the counted body
*is* the body we send. (ii) A bad key here is opaque, so it sits behind the same key-validation gate.

Current text models for the picker: `gpt-5.6-sol` (1.05M ctx, $5.00/$0.50 cached/$30.00 per 1M),
`gpt-5.6-terra` ($2.50/$0.25/$15.00), `gpt-5.6-luna` ($1.00/$0.10/$6.00).
