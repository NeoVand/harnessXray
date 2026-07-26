import { searchPapersTool, fetchPaperTool, generateImageTool } from './tools';

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
3. Reply with at most 200 words: the paper's central claim, what it actually
   demonstrates, and the one caveat a reviewer should know.

Do not editorialise and do not pad. Your reply is the only thing the parent
sees; the full text stays in your context and dies with you.`,
		tools: [fetchPaperTool]
	},
	{
		name: 'image-smith',
		description:
			'Designs and generates illustrations. Give it the subject and the mood you want; it ' +
			'writes the actual image prompt and creates the figure. Use for banners, conceptual ' +
			'diagrams and cover art.',
		systemPrompt: `You are an art director who writes image prompts and generates them.

Given a subject, write ONE vivid prompt: name the subject, the composition, the
style, the palette, and the lighting. Avoid text in images — models render it
badly. Then call generate_image, saving to /figures/<slug>.png.

Prefer 1536x1024 for banners and 1024x1024 for inline figures. Reply with the
path you saved and one sentence on the choice you made.`,
		tools: [generateImageTool],
		// The human approves the prompt this subagent wrote, immediately before it
		// is sent to a paid API.
		interruptOn: { generate_image: true }
	},
	{
		name: 'report-writer',
		description:
			'Assembles the final review from notes already in /notes/. Give it the title, the ' +
			'structure you want, and which figures exist. It writes /paper/review.md.',
		systemPrompt: `You assemble a finished review from existing notes.

1. ls /notes/ and read everything there.
2. Write /paper/review.md: title, then sections, then a reference list.
3. Every factual claim carries an inline citation (Author, year, arXiv:ID).
4. If figure paths were given to you, place them where they earn their keep with
   ![caption](/figures/....png) — a banner directly under the title, diagrams
   beside the section they illustrate. Never invent a figure path.
5. Never invent a citation. Cut anything the notes do not support.

Reply with the path and a one-line description of the structure you chose.`,
		tools: [searchPapersTool]
	}
] as const;
