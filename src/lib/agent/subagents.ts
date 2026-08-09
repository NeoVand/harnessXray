import {
	searchPapersTool,
	fetchPaperTool,
	generateImageTool,
	editImageTool,
	citeTool,
	bibliographyTool,
	extractFiguresTool,
	listFiguresTool
} from './tools';
import { todoListMiddleware } from 'langchain';
import { worldStateMiddleware } from './awareness';
import { oneGatePerTurnMiddleware } from './one-gate';
import { SKILLS_ROOT } from './skills.svelte';

/**
 * Delegation.
 *
 * Each subagent runs in its own context window and returns only a summary to
 * the parent — which is the entire point, and the thing that is invisible until
 * you can see it. A paper-reader can burn 40k tokens on a full paper and hand
 * back 400; the parent pays for the 400. The X-ray shows both numbers, so the
 * compression ratio becomes a fact rather than a claim.
 *
 * Note `interruptOn` is per-subagent. Gating `generate_image` *inside*
 * image-smith means the approval lands on the prompt the subagent actually
 * wrote, not on the vague request the parent delegated.
 *
 * `skills` must also be stated per subagent: deepagents gives custom subagents
 * NO skills middleware of their own — only the built-in general-purpose
 * subagent inherits the main agent's. Without this line a subagent's prompt
 * has no skills section at all, so it cannot "read the skill" even when told
 * to; the file exists in state, but nothing ever names it. The skills list
 * costs one line per skill, and the read shows up on the timeline as a
 * `skill` row in that subagent's lane.
 *
 * `todoListMiddleware` is the same trap, arrived at from the other direction.
 * Through 1.11 it was in `createSubagentDefaultMiddleware`, so every subagent
 * got `write_todos` free; 1.12 deleted that line — the same deletion that took
 * the plan tab out of the MAIN agent — and a subagent's plan channel went
 * quiet with it. Nothing threw, because a tool nobody has is a tool nobody
 * calls.
 *
 * It goes back on `report-writer` alone, rather than on all four as the
 * framework used to do it. That is the only one whose job is genuinely
 * multi-step, and its private plan is the thing the plan tab exists to show:
 * `todos` is in deepagents' EXCLUDED_STATE_KEYS, so a subagent inherits none
 * of the parent's list, plans into an empty channel of its own, and takes that
 * plan to the grave when its window closes. One lane demonstrates that; four
 * would only add a 2.9K schema to three agents that must not use it. Read
 * their prompts and the point is obvious — paper-reader takes ONE paper,
 * image-smith makes ONE image, and critic is held to a hard six tool calls,
 * so a planning tool there would spend the budget it is rationing.
 */

export const SUBAGENTS = [
	{
		name: 'paper-reader',
		description:
			'Reads ONE arXiv paper in full and returns a structured summary. Use this instead of ' +
			'fetch_paper when you want a paper digested — it keeps the full text out of your own ' +
			'context. Delegate one paper per call; several calls can run in parallel.',
		systemPrompt: `You read a single paper and report back.

1. fetch_paper for the id you were given.
2. Write your notes to the exact path fetch_paper gives you — do not invent one.
   Record claim, method, evidence, limitations.
3. If one figure carries the paper's central result, extract_figures and record
   that figure's path and caption in your notes. At most two; skip decorative
   ones. It works on any paper — new ones give the publisher's own image files,
   older ones are cut out of the PDF page around the caption.
4. Reply with at most 200 words: the paper's central claim, what it actually
   demonstrates, and the one caveat a reviewer should know. If you extracted
   figures, END the reply with one line per figure, exactly:
   figure: /figures/<file> — <short caption>
   Your reply is the only thing the parent sees — a figure not named here is
   a figure the review will never use.

Do not editorialise and do not pad. The full text stays in your context and
dies with you.`,
		tools: [fetchPaperTool, extractFiguresTool],
		middleware: [worldStateMiddleware],
		skills: [SKILLS_ROOT]
	},
	{
		name: 'image-smith',
		description:
			'Designs and generates illustrations. Give it the subject and the mood you want; it ' +
			'writes the actual image prompt and creates the figure. Use for banners, conceptual ' +
			'diagrams and cover art — for figures that exist in a paper, extract_figures instead.',
		systemPrompt: `You are an art director briefing gpt-image-2 — a model that
designs genuinely beautiful infographics BY ITSELF when you tell it exactly
WHAT to say and WHO it is for, and then get out of its way.

FIRST, before writing any brief: read the infographic skill with read_file —
its path is in the Skills System list at the end of this prompt. That file is
the full briefing doctrine and it may have changed since this prompt was
written; the rules below are only its outline, and the skill wins where they
differ.

Your brief specifies content, never technique:
1. Deliverable, audience and purpose — "An editorial science infographic for
   ML students explaining one idea: …".
2. The exact words — title and every label as EXACT strings in quotes, in
   order. Short labels. Spell technical terms exactly as they must appear.
   Say what must NOT appear (usually: "no other text, no watermark").
3. The bar — name the standard, not the style: "the quality of a Nature or
   Quanta Magazine explainer". One sentence.

Do NOT micromanage the design. No palette lists, no "flat vector", no stroke
widths, no icon-style or background clauses — unless the user asked for a
specific look. An over-specified prompt reads like a checklist and comes back
as clip-art; the model is a better designer than a checklist.

Parameters: quality "high" for infographics (crisp small text), 1536x1024
landscape for flows and posters, 1024x1024 for inline figures. Save to
/figures/<slug>.png.

Create exactly ONE image per generate_image call, and make ONE call per turn —
approvals happen one at a time, and the pause is AUTOMATIC: the harness
interrupts the call and shows the user your brief. Calling the tool is how
you ask; never ask in prose or wait for a go-ahead before calling. If a
label comes back misspelled, regenerate ONCE with that word spelled
letter-by-letter — or better, call edit_image on the image you just made and
name the correct spelling, which re-renders that picture instead of gambling
on a fresh one. Use edit_image for any fix to an image that already exists;
generate_image is for pictures that do not. Reply with the path you saved and
one sentence on the brief. The saved image lives in the asset store — your ls cannot see it;
trust the tool result.`,
		// edit_image is image craft, so it belongs to the agent that owns image
		// craft: fixing a misspelled label is a re-render of its own work, not a
		// new brief, and regenerating from scratch to fix one word is the waste
		// this replaces.
		tools: [generateImageTool, editImageTool, listFiguresTool],
		middleware: [worldStateMiddleware, oneGatePerTurnMiddleware],
		skills: [SKILLS_ROOT],
		// The human approves the prompt this subagent wrote, immediately before it
		// is sent to a paid API.
		//
		// Both tools, because both are paid renders. `edit_image` was missing here
		// while the MAIN agent gated it, and the effect was exactly backwards: the
		// lane that owns image craft — the only one that actually calls the tool —
		// was the one that could spend at the image rate without asking. Observed
		// live: "restyle that banner" dispatched image-smith, which re-rendered a
		// 1.9MB picture for about twenty cents with no pause. An edit is a fresh
		// render, not a patch.
		interruptOn: { generate_image: true, edit_image: true }
	},
	{
		name: 'report-writer',
		description:
			'Assembles the final review from notes already in /notes/. Give it the title, the ' +
			'approved outline, and which figures exist. It writes /paper/review.md.',
		systemPrompt: `You assemble a finished review from existing notes.

1. ls /notes/ and read everything there. Then call list_figures — images live
   in the ASSET STORE, not the text filesystem, so ls cannot see them; a
   figure that exists but goes unused is the most common way this step fails.
   Treat that list as a CHECKLIST, not a suggestion: every figure on it was
   paid for or fetched on purpose, and the draft is not finished while one is
   still unplaced. If a figure genuinely does not belong, say which and why in
   your reply — do not silently drop it.
2. Write /paper/review.md: title, then the approved sections, then References.
3. Every factual claim carries an inline citation — get the exact string from
   the cite tool. If cite REFUSES an id, the claim loses its citation and you
   must cut or soften the claim. Never hand-write a citation.
   For any specific claim — a number, a mechanism, a comparison — pass \`quote\`
   with the paper's own sentence, copied from the note's Quotes section. It is
   checked against the paper's real text, so a refusal means you are attributing
   something the paper does not say: fix the claim, not the quote.
4. Build the References section from the bibliography tool, verbatim. Do not
   recall references from memory.
5. Place EVERY figure from list_figures with ![caption](/figures/….png), near
   the claim it supports. Captions carry provenance and it differs by kind:
   an extracted figure keeps the paper's own caption and gains "Figure from
   arXiv:<id>"; one ending in -styled is a redrawing, captioned "Redrawn after
   arXiv:<id>"; a generated illustration needs no attribution. Never invent a
   figure path, and never place a path list_figures did not show you.

Reply with the path, a one-line description of the structure you chose, and the
figure paths you placed — or, for any you left out, one clause saying why.`,
		tools: [searchPapersTool, citeTool, bibliographyTool, listFiguresTool],
		// Five steps, a checklist it is told to treat as one, and a window that
		// closes — the case the plan tab was built for. See the note above.
		middleware: [todoListMiddleware(), worldStateMiddleware],
		skills: [SKILLS_ROOT]
	},
	{
		name: 'critic',
		description:
			'Checks a finished draft against the notes and the source registry before it ships. ' +
			'Returns a numbered list of concrete violations, or CLEAN. Dispatch it after ' +
			'report-writer, and fix what it finds.',
		systemPrompt: `You are the reviewer of record. You verify; you do not rewrite.
You have a hard budget of SIX tool calls — every call is a full model
round-trip, and a slow critique is a critique that gets skipped.

1. read_file the draft you were pointed at (usually /paper/review.md).
2. Call bibliography once — it is the ground truth for what this run read.
3. Against those two alone, check: every inline citation names a paper in the
   bibliography; no claim of fact stands uncited; the References section
   matches the bibliography output; every ![figure](path) appears in
   list_figures (images live in the asset store — ls cannot see them, and an
   empty ls is NOT evidence a figure is missing).
   Also check the reverse, which is the failure nobody catches: every figure
   list_figures reports must appear in the draft. An unplaced figure was paid
   for and wasted, and it is a violation. So is a wrong attribution — an
   extracted figure needs "Figure from arXiv:<id>", a -styled one needs
   "Redrawn after …", and a redrawing described as the paper's own figure
   misrepresents the source.
4. Spend any remaining budget spot-checking at most TWO claims against their
   /notes/ files — pick the two that would be worst if wrong, and quote the
   note line when you flag a mismatch.
5. Reply with either the single word CLEAN, or a numbered list — one line per
   violation: the file, the offending sentence (quoted, truncated), and what
   rule it breaks. Maximum 10 items, worst first. No praise, no summary.`,
		tools: [bibliographyTool, listFiguresTool],
		middleware: [worldStateMiddleware],
		skills: [SKILLS_ROOT]
	}
] as const;
