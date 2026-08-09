# Building a Genuinely Good Browser-Only Literature Research Agent: What the 2025–2026 Literature Says

## TL;DR

- **The evidence strongly supports a "small tool set + external verification + citation-graph traversal + client-side semantic retrieval" architecture.** The biggest measured wins available under your no-key/no-server constraint are (a) keeping the tool count low with high-quality descriptions, (b) adding _external_ claim-level citation verification (not self-critique), and (c) doing one round of backward+forward snowballing on top of keyword search — each backed by quantitative results.
- **Your existing "did-we-read-it" citation registry aligns with the literature but is not sufficient alone:** measured citation-hallucination rates of 11–57% in deployed deep-research agents, plus 3–13% fabricated _URLs_, mean you should add claim-level, retrieval-grounded entailment checks. Self-critique _without_ external evidence is repeatedly shown NOT to improve (and sometimes to degrade) accuracy — treat "critic subagents" with suspicion unless they consult the fetched source text.
- **In-browser embeddings and statcheck-style numeric checking are realistic today** (all-MiniLM-L6-v2 ≈8–12 ms/embedding on WASM, ~24–32 ms batch-1 on WebGPU), and several practical keyless APIs are missing from your list — but CORS behavior for most must be **empirically tested from your deployed origin**, because documentation almost never states it.

## Key Findings

- Tool-count degradation is real and measurable: 7–85% performance drops going from ~49 to ~741 tools; middle-of-list tools are selected worse (positional bias). You are far below the danger zone; prefer few, well-described tools, or a single flexible "code-execution" tool.
- Citation verification that _works_ (measured) is retrieval-grounded and claim-level (CiteGuard, SemanticCite, CiteEval); pure self-consistency/self-correction does not (Huang et al. 2024).
- Snowballing measurably improves recall: one round of backward+forward snowballing added to a database search yields 90–100% recall in software-engineering SLRs; snowballing alone found 83% vs 46% for database search in one study.
- A dense field of 2025–2026 deep-research benchmarks now exists (DeepResearch Bench, DeepScholar-Bench, ResearcherBench, LiveResearchBench, ReportBench, ResearchRubrics, Mind2Web 2, BrowseComp); most are openly available and separately score report quality, coverage, and citation faithfulness.
- Procedural memory / skills give modest but real gains (+2.8 to +6.7 points in recent benchmarks) — but only when the skill matches the task; narrow skills overfit and become dead weight.
- The dominant anti-patterns are context rot (measured degradation well before the window fills), multi-agent coordination failure (MAST: 14 failure modes), and verification theater (self-correction without external feedback).

---

## Q1. Tool design for research agents

**MEASURED RESULTS**

- **Tool-count scaling degrades performance, sharply and non-linearly.** A controlled study (cited as Kate et al., 2025, "LongFuncEval") stress-tested tool calling from 49 to 741 tools and reported **7–85% performance drops**. Independent summaries give concrete numbers: ~50 tools (≈8K tokens) → 84–95% accuracy; ~200 tools (≈32K tokens) → 41–83%; ~740 tools (≈120K tokens) → 0–20% for most models. Corroborated by RAG-MCP (Gan and Sun, 2025), which shows degradation as tool count grows toward ~11,100 MCP tools, and by ToolDreamer (arXiv:2510.19791), which finds GPT-4.1 and Qwen3 handle 10–128 tools well but hit context/registration limits beyond that.
- **Positional bias ("lost in the middle" for tools):** with 741 tools, tools at the beginning/end were selected at ~31–32% accuracy vs. ~22% for middle positions in the reported "BiasBusters" analysis; root cause attributed to RoPE long-term decay.
- **Retrieval errors dominate failures at scale:** LiveMCPBench (Mo et al., 2025) finds retrieval errors account for ~50% of agent failures across 527 tools.
- **Tool descriptions materially change behavior (measured):** Anthropic's engineering write-up "Writing effective tools for AI agents—using AI agents" (Sep 11, 2025) reports that refining tool descriptions produced state-of-the-art results on SWE-bench; they used Claude to auto-optimize descriptions against a held-out eval set.
- **One flexible tool (code) beats many narrow tools (measured):** CodeAct — Wang et al., "Executable Code Actions Elicit Better LLM Agents" (arXiv:2402.01030, ICML 2024) — reports, verbatim, that "extensive analysis of 17 LLMs on API-Bank and a newly curated benchmark M3ToolEval shows that CodeAct outperforms widely used alternatives like Text and JSON (up to 20% higher success rate)," alongside ~30% fewer turns/steps. Foundational (2024) but directly relevant.

**PROPOSALS / ENGINEERING GUIDANCE**

- Tool-RAG (retrieve the relevant subset of tools per query) is widely proposed (Toolshed, ScaleMCP, RAG-MCP, ToolDreamer) as the fix once you exceed ~20–50 tools. Engineering write-ups (Red Hat, vLLM Semantic Router) recommend categories/routing below ~20 tools and Tool-RAG above ~50.
- "How Many Tools Should an LLM Agent See? A Chance-Corrected Answer" (arXiv:2605.24660) argues search _depth_ itself should be evaluated, not just retrieval quality.

**IMPLICATION FOR YOU:** With ~4 tools you are far below the danger zone; do NOT add Tool-RAG. Keep tools few and invest in description quality. If you want flexibility, a single sandboxed compute/code tool is better-supported by evidence than many micro-tools. **Evidence is strong** for the count-degradation curve and CodeAct; **thin** on the optimal count for a <10-tool literature agent (no study targets that regime directly).

---

## Q2. Reducing fabricated citations

**MEASURED RESULTS**

- **The problem is large and measured.** Deep-research agents show citation-hallucination rates of **11–57%** across deployed models (cited as Yuan et al., 2026). "Detecting and Correcting Reference Hallucinations in Commercial LLMs and Deep Research Agents" (arXiv:2604.03173) finds **3–13% of cited URLs are fabricated** — a failure your registry catches but that citation-_support_ metrics miss. DeepResearch Bench (Du et al., arXiv:2506.11763) FACT framework measured citation accuracy from **78% (OpenAI Deep Research) to 94% (Claude with search)**; Perplexity Deep Research showed 90.24%.
- **Retrieval-grounded, claim-level verification works (measured):**
  - **CiteGuard** ("Faithful Citation Attribution for LLMs via Retrieval-Augmented Validation," arXiv:2510.17853) reaches **68% accuracy on CiteME**, approaching human level (68% vs 70%), via retrieval-aware verification.
  - **SemanticCite** (Haan, 2025) classifies citation support with **84% accuracy** — but requires the cited source be accessible.
  - **CiteEval** (Xu et al., arXiv:2506.01829) does fine-grained, retrieval-context-aware citation assessment, going beyond NLI.
  - **RefChecker** (Hu et al., 2024) uses a claim-triplet framework for fine-grained hallucination detection.
  - **AttributionBench** (Li et al., 2024): even fine-tuned GPT-3.5 reaches only **80% macro-F1** on binary attribution — verification is itself hard.
  - **CiteME** (Press et al., arXiv:2407.12861): LLMs achieve only **4–18% accuracy** at identifying the correct paper to cite unaided.
  - Citation-Enhanced Generation (CEG) — iterative retrieval + NLI verification, regenerating until each statement is entailed — is a measured pipeline.
- **Critic/self-correction the WRONG way does NOT work (measured):** "Large Language Models Cannot Self-Correct Reasoning Yet" (Huang et al., arXiv:2310.01798, ICLR 2024) shows intrinsic self-correction (no external feedback) fails to improve and often degrades performance. Kamoi et al. (TACL 2024), "When Can LLMs Actually Correct Their Own Mistakes?" reinforces this: self-correction helps only with reliable external feedback.

**PROPOSALS / EMERGING**

- Multi-agent verification (CiteAudit, Yuan et al. 2026) for fabricated references — proposal-stage; effect sizes less established.
- Metadata-aware prompting/abstention (request DOIs/URLs or abstain) — plausible, limited measured effect.

**IMPLICATION FOR YOU:** Your registry (block any citation for an unread paper) is the right _existence_ gate and matches the 3–13% fabricated-URL finding. Add a **claim-level, retrieval-grounded entailment check**: for each sentence with a citation, verify the cited (already-fetched) text entails the claim. This is the measured-effective pattern. A "critic subagent" only helps if it consults the actual fetched source text — a critic reasoning from memory is verification theater. **Evidence is strong** that external claim-level checks work and that intrinsic self-correction does not.

---

## Q3. Citation-graph search strategy (snowballing vs keyword)

**MEASURED RESULTS**

- **Snowballing substantially improves recall.** Badampudi, Wohlin & Petersen ("Experiences from using snowballing and database searches," ACM 2015): snowballing identified **83% of relevant papers vs 46% for database search**. Foundational guideline: **Wohlin (2014), "Guidelines for snowballing in systematic literature studies"** (EASE 2014) — still the canonical protocol (define a good start set; iterate backward+forward until no new papers).
- **Hybrid is best (measured):** Mourão et al., "On the Performance of Hybrid Search Strategies for Systematic Literature Reviews in Software Engineering" (arXiv:2004.09741; _Information & Software Technology_, 2020) states verbatim that "Scopus is the most consistent option ... but it found just from 13% to 35% of the relevant papers alone," and that "a single iteration of backward and forward snowballing complementing the database search provides 90% to 100% of recall."
- **Automated snowballing is feasible (measured):** "Automatic Evidence Retrieval for Systematic Reviews" (PMC4211030) achieved **97.7% precision** and 66.7–85.5% recall automatically identifying cited articles.
- **LLM-assisted screening (measured, 2025–2026):** A systematic review (ScienceDirect S089543562600096X, 2026) found title/abstract screening most mature at **99.2% sensitivity / 83.6% specificity**, vs full-text screening 97.6% / 47.4%. Thode et al. (2025): combining LLMs by unanimity reached **99% recall at 27% precision**. Syriani et al. (2024): ChatGPT mean recall 0.74 (range 0.33–0.95). Human-LLM collaborative screening (BMC Med Res Methodol, 10.1186/s12874-025-02674-3, 2025) uses near-perfect-recall prompts + human verification of positives only.

**PROPOSALS / STANDARDS**

- **PRISMA 2020** and **PRISMA-S** (search-reporting extension) are the human standards. LLM-specific: **PRISMA-DFLLM** (Susnjak, arXiv:2306.14905, 2023) adds items for dataset preprocessing, model details, evaluation. A PRISMA-aligned LLM screening workflow exists (Springer 10.1007/978-3-032-30813-9_3, 2025). "PRISMA for LLM"–style consensus standards are still emerging — treat as proposals.
- **Stopping rules:** the canonical rule is _saturation_ — stop snowballing when an iteration yields no new relevant papers (Wohlin). No LLM-specific stopping-rule study was found; **evidence is thin** here.

**IMPLICATION FOR YOU:** Add **one round of backward+forward snowballing** — you already have OpenAlex/Crossref/OpenCitations, so this is nearly free. Build a start set with keyword search, chase references/citations one iteration, stop at saturation. This is the single best-evidenced coverage improvement. Report the process in PRISMA style (sources, counts, inclusion/exclusion) for teaching value.

---

## Q4. Deep-research / report-generation benchmarks

All verified to exist (2025–2026 unless noted). **MEASURED / REAL:**

- **DeepResearch Bench** (Du et al., **arXiv:2506.11763**, 2025): 100 PhD-level tasks across 22 fields. Two frameworks — **RACE** (reference-based report quality) and **FACT** (citation trustworthiness / effective citations + accuracy). Public leaderboard on HuggingFace. Criticism: RACE is LLM-judge-based, subject to judge bias.
- **DeepScholar-Bench** (arXiv:2508.20033, NeurIPS 2025 workshop): a **live** benchmark whose task is generating related-work sections from recent arXiv papers. Scores **knowledge synthesis, retrieval quality, verifiability** (citation precision, claim coverage), with an open-source reference pipeline DeepScholar-ref (LOTUS). Key measured finding, verbatim: "no system surpasses a geometric mean of 31% across all metrics" — the benchmark is far from saturated. Data public.
- **Mind2Web 2** (Gou et al., 2025): 130 long-horizon agentic-search tasks; "Agent-as-a-Judge" for answer correctness + source attribution.
- **BrowseComp** (Wei et al., **arXiv:2504.12516**, OpenAI, 2025): hard browsing-agent benchmark (short verifiable answers, not report quality). BrowseComp-ZH and BrowseComp-Plus are variants (Plus's dataset licensing I could not fully verify — flag as needs-checking).
- **ReportBench** (2025): uses published arXiv survey papers as gold references via reverse prompt engineering; scores (1) quality/relevance of cited literature and (2) statement faithfulness.
- **ResearcherBench** (Xu et al., arXiv:2507.16280, 2025): frontier scientific-inquiry tasks; rubric coverage + factual assessment.
- **LiveResearchBench** (Wang et al., arXiv:2510.14240, 2025): user-centric "in the wild" deep research.
- **ResearchRubrics** (Sharma et al., 2025): rubric-based; can assign _negative_ weights to penalize misinformation.
- **Deep Research Bench** (FutureSearch, Bosse et al., arXiv:2506.06287, 2025): evaluates AI web-research agents (distinct from DeepResearch Bench — note name collision).
- **ScholarQA-CS / ScholarQABench** (Asai et al., OpenScholar lineage, 2024): expert-written literature-review questions with answer rubrics; meta-evaluation critiqued in "Deep Research, Shallow Evaluation" (arXiv:2603.06942).
- **CiteEval / CiteME / AttributionBench** — citation-faithfulness-specific (see Q2), all public.
- **General (note as general, not research-specific):** GAIA (Mialon et al.), HLE, FRAMES, WebWalkerQA.

**Newer/2026 (verify licensing):** ADRA-Bank (arXiv:2512.00986), RigorousBench (Yao et al. 2025), DeepConsult, DEER (arXiv:2512.17776), FinDeepResearch (arXiv:2510.13936). DRACO (Zhong et al. 2026) evaluates on 100 Perplexity-derived tasks; best system only 65% citation quality / 68% factual accuracy.

**Common criticism of the metrics:** most rely on LLM-as-judge (RACE, Agent-as-a-Judge), conflating fluency with rigor and inheriting judge bias; reference-based ones risk staleness/contamination (hence the move to "live" benchmarks like DeepScholar-Bench and LiveResearchBench). **Evidence is strong** that these benchmarks exist and are mostly open; **thin/contested** on which metric best predicts real report quality.

---

## Q5. Keyless, CORS-open scholarly data sources

**Critical caveat (from primary verification):** CORS headers are almost never documented. For nearly every API below, whether a browser `fetch()` from your origin succeeds must be **tested empirically from your deployed origin**. Labels: DOCUMENTED / COMMUNITY-REPORTED / UNKNOWN.

**What you're likely MISSING (keyless, worth testing):**

_Retractions & integrity_

- **Crossref REST API retraction data** — Retraction Watch data is now IN the production Crossref API (`api.crossref.org/works?filter=update-type:retraction`; `source: retraction-watch` in the `update-to` field). **No key.** Since you already confirmed Crossref works from the browser, this is the cleanest way to get retractions — **prefer this over the Labs API.** (DOCUMENTED that the data is present; CORS inherits your confirmed Crossref access.)
- **Crossref Labs API** (`api.labs.crossref.org`) — being deprecated in favor of production REST; don't build on it.
- **NIH iCite** (`icite.od.nih.gov/api/pubs`) — no key; citation metrics + references by PMID (comma-separated PMIDs, `&refs=true`, `&format=csv`). CORS UNKNOWN.
- **Problematic Paper Screener** — web tool, not a clean keyless JSON API; treat as out of scope.

_Peer reviews / open evaluations_

- **Sciety DocMaps API** (`sciety.org/docmaps/v1/index`; batch) and **EMBO Early Evidence Base** (`eeb.embo.org/api/...`) — machine-readable preprint peer-review metadata (JSON-LD). No key. CORS UNKNOWN — test.
- **eLife API** (`api.elifesciences.org`) — no key; CORS UNKNOWN.
- **PubPeer** — API is **keyed** (contact for key); no public keyless API. **Out of scope** under your constraint.
- **PREreview / Review Commons** — data largely surfaced via DocMaps/Sciety; no confirmed standalone keyless CORS API.

_Full text_

- **Europe PMC REST full text** (`ebi.ac.uk/europepmc/webservices/rest/{source}/{id}/fullTextXML`) — you have Europe PMC; the full-text-XML route is the same host, **no key** (DOCUMENTED). Test the fullTextXML route specifically.
- **bioRxiv/medRxiv API** (`api.biorxiv.org`) — no key; gives published-DOI links (useful for preprint→published dedup). CORS UNKNOWN.
- **PLOS Search API** (`api.plos.org/search`) — no key; **supports JSONP via `callback`** (a signal CORS may be limited — but JSONP is itself a keyless browser workaround). Rate limits DOCUMENTED: ≤7,200/day, 300/hr, 10/min, 5s between searches, 5 concurrent connections per IP.
- **arXiv** — official API is `export.arxiv.org/api/query`; CORS UNKNOWN for the query API, `arxiv.org/html/` renderings, and ar5iv (you already found ar5iv blocked). arXiv now renders HTML from `arxiv.org/abs`; test cross-origin. You already fetch arXiv full text, so a working path exists. Rate convention: ~1 request / 3 seconds.
- **Internet Archive Scholar / fatcat API** — potentially keyless; CORS UNKNOWN (not verified — flag).

_Trials / orgs / repos / other_

- **ClinicalTrials.gov API v2** (`clinicaltrials.gov/api/v2/studies`) — no key (DOCUMENTED). ⚠️ Runs a WAF that blocks some clients by TLS fingerprint — browser behavior may be inconsistent; test.
- **OSF API** (`api.osf.io/v2`) — no key for public data; CORS UNKNOWN.
- **ROR** (`api.ror.org/organizations`) — no key **now**; 2,000 req/5min. ⚠️ **A free client ID will be required ~Q3 2026** to keep that rate (else throttled to 50/5min). CORS likely permissive (designed for autocomplete) but UNKNOWN.
- **SciELO ArticleMeta** (`articlemeta.scielo.org/api/v1`) — no key; CORS UNKNOWN; prefer bulk download.
- **protocols.io** — **OAuth token required even to read** → unsafe client-side. **Out of scope.**
- **Crossref Event Data** — **officially shut down 23 April 2026.** Do not use. (Replaced by a data-citation endpoint in the main REST API.)

_Code & artifacts_

- **Papers with Code shut down 24 July 2025** (Meta), redirecting to HuggingFace "Trending Papers." The historical dataset is frozen on GitHub (`paperswithcode/paperswithcode-data`, last updated ~Sep 8, 2025) and mirrored on HuggingFace. **You cannot rely on a live PwC API.** For code links now: HuggingFace Hub (you have it), Zenodo/Software Heritage (you have them), ASCL (Astrophysics Source Code Library), and OpenAlex/Crossref relation fields.

**Polite-pool conventions (not keys — safe client-side):** OpenAlex — add `mailto=` (polite pool). Crossref — `mailto=` (polite pool, ~50 req/s). NCBI E-utilities — `tool=` + `email=` (3 req/s without key, 10 with an optional free key). NCBI E-utilities keyless CORS is COMMUNITY-REPORTED (a JS wrapper advertises browser use) but UNKNOWN — test.

**Explicitly out of scope (need key/proxy/token):** Semantic Scholar (CORS-blocked, confirmed), OpenReview (blocked), ar5iv (blocked), NASA ADS (key), CORE (key), Scite/Dimensions/Lens.org (key), Springer/Elsevier TDM (key), PubPeer (key), protocols.io (token).

---

## Q6. Skills / procedural memory vs system prompt

**MEASURED RESULTS**

- **Skills give modest, real gains — when they match the task.** "Managing Procedural Memory in LLM Agents: Control, Adaptation, and Evaluation" (arXiv:2606.23127) introduces the AFTER benchmark (382 enterprise tasks, 22 skills) and reports procedural skills improve full-pass accuracy by **+2.8 points on average** on a static benchmark, and **+3.7 to +6.7 points** after a refinement round in industrial workflows; skills evolved from _diverse_ multi-model traces hit **73.1% cross-model accuracy**, beating single-source skills.
- **Skills overfit (measured downside):** the same work shows skills from _narrow_ experience exhibit "source-context overfitting" — improving specificity while degrading generality. This is your "dead weight / skill interference" risk, empirically demonstrated.
- **Foundational:** Agent Workflow Memory (Wang, Mao, Fried, Neubig, ICML 2025) and Voyager's skill library (2023). Memp ("Exploring Agent Procedural Memory," arXiv:2508.06433, 2025) formalizes storage/update policies.
- **Text procedural memory has a "text-action disconnect" (measured):** "Neural Procedural Memory" (arXiv:2606.29824) shows agents given a retrieved textual workflow sometimes fail to align it to execution and omit steps — a caution that a markdown SKILL.md is not automatically followed.

**PROPOSALS / ENGINEERING**

- **Anthropic Agent Skills / SKILL.md** ("Equipping agents for the real world with Agent Skills," Oct 16, 2025) — the format you're using; presented as engineering guidance, not a measured ablation.
- **Agentic Context Engineering (ACE)** (arXiv, Oct 2025) and Dynamic Cheatsheet / GEPA — self-evolving context/playbooks; promising but effect sizes early. (ACE's headline numbers I could not fully verify — flag as needs-checking.)

**IMPLICATION FOR YOU:** Skills-as-markdown is reasonable and matches Anthropic's shipped pattern, with modest measured gains. Rules from the evidence: (1) keep skills _specific to recurring literature tasks_ (e.g., "how to run a snowballing pass," "how to format a PRISMA count"); (2) retrieve a skill only when the task matches, because irrelevant skills are measured dead weight and add context rot; (3) prefer skills distilled from diverse runs over one-off traces. Putting the _same_ guidance permanently in the system prompt is worse at scale because it always consumes context (see Q7) — retrieval-gated skills are better. **Evidence is moderate**, mostly from enterprise/coding benchmarks, not literature agents specifically (thin there).

---

## Q7. Anti-patterns (what's actively harmful)

**MEASURED RESULTS**

- **Context rot / long-context degradation.** Hong, Troynikov & Huber (Chroma), "Context Rot: How Increasing Input Tokens Impacts LLM Performance" (July 2025) evaluated 18 LLMs including GPT-4.1, Claude 4, Gemini 2.5, and Qwen3, finding their performance "grows increasingly unreliable as input length grows" — degradation appears **well before the context window fills** (e.g., a 200K-window model degrading by ~50K tokens; reported drops of 30–50%). This directly indicts "dump full-text of many papers into context." **Lost-in-the-middle** (Liu et al., TACL 2024): >30% accuracy drop when the relevant document is mid-context; U-shaped attention; RoPE long-term decay is the architectural cause.
- **Multi-agent systems fail in structured ways (measured).** MAST — Cemri et al., "Why Do Multi-Agent LLM Systems Fail?" (**arXiv:2503.13657**, NeurIPS 2025 Datasets & Benchmarks spotlight): "1600+ annotated traces collected across 7 popular MAS frameworks"; the taxonomy "identifies 14 unique modes, clustered into 3 categories: (i) system design issues, (ii) inter-agent misalignment, and (iii) task verification" (roughly 42% / 37% / 21%), "validated by high inter-annotator agreement (κ = 0.88)." They conclude better base models alone won't fix the taxonomy. This is the empirical counterpart to Cognition's engineering argument "Don't Build Multi-Agents" (over-delegation, context-handoff loss).
- **Self-correction / verification theater (measured).** Huang et al. (arXiv:2310.01798, ICLR 2024): intrinsic self-correction without external feedback fails to improve and often _degrades_ reasoning. Kamoi et al. (TACL 2024): self-correction helps only with reliable external feedback. → A critic subagent that doesn't consult external evidence adds cost without accuracy.
- **Premature summarization / handoff information loss** maps to MAST's "loss of conversation history" and step-repetition modes; measured as recurring in the trace analysis.

**ENGINEERING WRITE-UPS (clearly labeled as such)**

- Cognition "Don't Build Multi-Agents" (over-delegation, fragile context sharing) — high-quality but not a controlled study.
- Anthropic "Effective context engineering for AI agents" (Sep 29, 2025) — argues for minimal, curated context; consistent with context-rot findings.

**IMPLICATION FOR YOU:** Your subagents (paper-reader, report-writer, critic, image-smith) are a _bounded_ multi-agent system — the risky part per MAST is coordination + verification, not the count. Guardrails: (1) never pass full paper text between agents — pass extracted claims/quotes + IDs (mitigates context rot AND handoff loss); (2) make the critic _external-evidence-grounded_ or drop it; (3) add explicit termination conditions (MAST's "unaware of termination" is a top failure mode). **Evidence is strong** across all four anti-patterns.

---

## Q8. In-browser client-side capabilities

**MEASURED RESULTS / CONCRETE COSTS**

- **Local embeddings are practical today.** Transformers.js (v4, ONNX Runtime Web) runs `all-MiniLM-L6-v2` (22M params, 384-dim). Measured: **8–12 ms per embedding on WASM (M2 MacBook Air)**; on WebGPU, Xenova's official benchmark shows batch-1 latency **~24–32 ms** (unquantized, seq len 512) and large gains at batch (batch-32 ≈ 385 ms on WebGPU vs ~12,600 ms on WASM — a ~30x+ speedup; the author reported up to ~64x on some devices). Quantized model download ≈ 20–30 MB. bge-small-en-v1.5 (384-dim) and nomic-embed-text-v1.5 (768-dim) are also available. WebGPU availability is now broad in Chrome/Edge; WASM is the universal fallback.
- **Client-side vector search:** for a few thousand chunks, a flat cosine scan in JS is fine (sub-100 ms). HNSW libraries exist in JS but are unnecessary below ~10K–50K vectors — well within a single research run's footprint.
- **statcheck-style numeric checking is directly portable.** The statcheck algorithm (Nuijten & Epskamp): regex-extract APA-style NHST results (t, F, r, χ², Z, Q with df), recompute the p-value, flag inconsistencies/decision-errors, accounting for rounding. Pure string+math — **trivially reimplementable in JS, no dependencies.** Empirical value: Nuijten, Hartgerink, van Assen, Epskamp & Wicherts (2016), _Behavior Research Methods_ 48(4):1205–1226 (DOI 10.3758/s13428-015-0664-2), analyzing >250,000 p-values from eight psychology journals (1985–2013), found "half of all published psychology papers that use NHST contained at least one p-value that was inconsistent," and "one in eight papers contained a grossly inconsistent p-value that may have affected the statistical conclusion." **GRIM** (Brown & Heathers 2016) — checks whether a reported integer-data mean is possible for N — is also pure arithmetic and JS-portable; flagged ~half of tested papers.
- **Preprint/published deduplication:** use bioRxiv's published-DOI field, Crossref relation `is-preprint-of`, and OpenAlex biblio/related-work fields; fuzzy title match + DOI-version clustering. All doable with APIs you already have. (Measured effectiveness in your setting is untested — **thin evidence.**)

**PROPOSALS / CAVEATS**

- **PDF table extraction in-browser is hard.** pdf.js gives you a text layer (works for born-digital PDFs, no OCR). Real table-structure recovery (Docling, Marker, Nougat, GROBID) is **not browser-runnable** — GROBID has no WASM build (consistent with your own note; I found no browser build). Expect degraded table extraction client-side; the pragmatic path is pdf.js text + heuristic column detection, accepting imperfect tables.
- **Numeric prose↔table consistency checking** beyond statcheck/GRIM is not a packaged client-side capability — you'd build heuristics. Proposal-stage.
- **Does semantic retrieval over fetched full text actually improve report quality?** The general RAG/hybrid (BM25+dense) literature says yes for retrieval precision, and context-rot findings (Q7) say targeted retrieval beats dumping full text — so semantic chunk retrieval is well-motivated. But a _head-to-head measured_ result specifically for an in-browser literature agent doesn't exist — **evidence is indirect.**

**IMPLICATION FOR YOU:** In-browser embeddings + flat cosine search + statcheck/GRIM checkers are the highest-value, lowest-risk client-side additions, all with realistic costs (tens of MB download, ms-per-chunk). They also make superb teaching demos (show the embedding request, the vector scan, the p-value recomputation live).

---

## Recommendations — Ranked list of concrete capabilities to add (no extra key, no server)

1. **Claim-level, retrieval-grounded citation verifier (entailment check against already-fetched source text).**
   - _Benefit:_ Directly attacks the measured 11–57% citation-hallucination / 3–13% fabricated-URL problem; the one verification pattern with measured success (CiteGuard 68%, SemanticCite 84%). Complements your existence-registry.
   - _Cost:_ Medium. One extra (batchable) LLM pass per cited sentence comparing claim ↔ fetched quote; reuses your OpenAI key. No new API.
   - _Evidence:_ Strong — CiteGuard (arXiv:2510.17853), SemanticCite (2025), CiteEval (arXiv:2506.01829), CEG; plus the negative result that self-critique alone fails (Huang et al. arXiv:2310.01798).

2. **One-iteration backward + forward snowballing over OpenAlex/Crossref/OpenCitations.**
   - _Benefit:_ Largest measured coverage gain — hybrid keyword+snowball reached 90–100% recall vs 13–35% keyword-alone. Uses APIs you already have.
   - _Cost:_ Low–medium. Traverse references + citations of the start set once; dedup; stop at saturation.
   - _Evidence:_ Strong — Mourão et al. (arXiv:2004.09741), Wohlin (2014), Badampudi/Jalali/Wohlin.

3. **In-browser embeddings + flat cosine semantic search over fetched full text (Transformers.js, all-MiniLM-L6-v2 on WebGPU/WASM).**
   - _Benefit:_ Targeted retrieval instead of dumping full text → mitigates context rot (measured 30–50% degradation) and improves the report-writer's grounding.
   - _Cost:_ Low–medium. ~20–30 MB one-time model download; ~10 ms/chunk WASM, faster on WebGPU; flat cosine fine to ~10K chunks.
   - _Evidence:_ Strong on cost/feasibility (Xenova benchmarks); indirect on report-quality uplift (context-rot + RAG literature).

4. **statcheck + GRIM numeric-consistency checkers, reimplemented in JS.**
   - _Benefit:_ Flags internal statistical inconsistencies in fetched papers (measured: ~half of psychology papers have ≥1 inconsistency; 1 in 8 decision-changing). High trust/teaching value, zero API cost.
   - _Cost:_ Low. Pure regex + arithmetic; runs on the pdf.js text layer.
   - _Evidence:_ Strong for the checkers' error-detection value (Nuijten et al. 2016, DOI 10.3758/s13428-015-0664-2; Brown & Heathers 2016); their use inside an agent is novel (thin).

5. **Retrieval-gated skills (SKILL.md) for recurring literature procedures, loaded only on task match.**
   - _Benefit:_ +2.8 to +6.7 point gains measured for matched procedural memory; avoids permanent system-prompt bloat.
   - _Cost:_ Low. You already have the skills mechanism; add match-gated retrieval + keep skills specific.
   - _Evidence:_ Moderate — AFTER/procedural-memory (arXiv:2606.23127), AWM (ICML 2025); with measured overfitting downside if skills are too narrow.

6. **Retraction & integrity flags via the production Crossref API (`update-type:retraction`) + NIH iCite.**
   - _Benefit:_ Warns when a cited/candidate paper is retracted — high-stakes for integrity and a strong teaching feature. Uses Crossref, whose CORS you've confirmed.
   - _Cost:_ Low. One filter/field on calls you already make; iCite is an extra keyless call (test CORS).
   - _Evidence:_ Strong that the data is present and keyless (Crossref docs); Crossref CORS already confirmed by you.

7. **Preprint↔published deduplication (Crossref `is-preprint-of`, bioRxiv published-DOI, OpenAlex biblio).**
   - _Benefit:_ Prevents double-counting the same work; cleaner coverage stats.
   - _Cost:_ Low. Fields on existing APIs + fuzzy title/DOI-version clustering.
   - _Evidence:_ Mechanism documented; in-agent effectiveness untested (thin).

8. **Expand keyless source coverage — but gate each behind a live CORS self-test from your deployed origin.**
   - _Candidates to test:_ Europe PMC fullTextXML, bioRxiv/medRxiv API, PLOS (JSONP fallback), Sciety DocMaps + EMBO EEB (peer-review data), eLife API, ClinicalTrials.gov v2, OSF, ROR (before its Q3-2026 client-ID change), SciELO ArticleMeta, iCite.
   - _Benefit:_ Broader full-text, peer-review, and trials coverage — all keyless.
   - _Cost:_ Low per source, but requires a runtime CORS probe + graceful fallback (docs rarely state CORS).
   - _Evidence:_ Key-not-required is documented for most; **CORS is UNKNOWN for most and must be tested** (per primary verification).

9. **Prefer a single flexible compute/code tool over adding many narrow tools; keep total tools well under ~20.**
   - _Benefit:_ Avoids the measured tool-count degradation curve; CodeAct shows +20% success / −30% steps for code-as-action.
   - _Cost:_ Medium (sandboxed JS/WASM execution in-browser).
   - _Evidence:_ Strong — CodeAct (arXiv:2402.01030); tool-scaling studies (Kate et al. 2025; RAG-MCP).

10. **Harden the multi-agent loop against MAST failure modes: pass claims+IDs (not full text) between agents, add explicit termination conditions, and only keep the critic if it's external-evidence-grounded.**
    - _Benefit:_ Attacks the top measured multi-agent failure categories (coordination, verification, termination).
    - _Cost:_ Low–medium (protocol/prompt changes).
    - _Evidence:_ Strong — MAST (arXiv:2503.13657); self-correction limits (arXiv:2310.01798).

## Caveats

- **CORS is the crux and is under-documented.** For nearly every API in Q5 outside your confirmed set, whether a browser fetch succeeds must be **tested from your actual deployed origin** — statuses are labeled DOCUMENTED/COMMUNITY-REPORTED/UNKNOWN honestly, and I did not assert CORS behavior I could not verify. Build a runtime CORS probe with graceful fallback.
- **Some 2026 arXiv IDs are very recent preprints** (e.g., 2604.xxxxx, 2605.xxxxx, 2606.xxxxx) surfaced in search snippets; their claims are reported as the papers state them, but a handful (ACE headline numbers, BrowseComp-Plus licensing, "Kate et al. 2025" exact title/venue) I could not fully open and verify — flagged in-text as needs-checking. Treat the specific percentage from any single unverified preprint as indicative, not definitive.
- **Most measured skill/procedural-memory and tool-count results come from coding/enterprise/web-agent benchmarks, not literature agents specifically** — the direction transfers well but exact magnitudes may differ for your domain.
- **The strongest evidence is negative/architectural** (self-correction fails, context rot, tool-count degradation, multi-agent failure taxonomy). Positive "this makes reports better" evidence for in-browser techniques is often _indirect_ (extrapolated from RAG/context-rot literature) rather than measured on a browser literature agent — noted at each point.
- **Papers with Code is gone (July 2025)** — do not design around a live PwC API; use the frozen dataset or HuggingFace/Zenodo/Software Heritage/ASCL for code links.
- **Crossref Event Data shuts down 23 April 2026** and **ROR will require a free client ID ~Q3 2026** — plan around both.
